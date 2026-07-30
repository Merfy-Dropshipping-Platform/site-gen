#!/usr/bin/env bash
# Управление локальным контуром Merfy.
#
# Заменяет `pkill -f "dist/src/main.js"` — под этот шаблон попадают ВСЕ сервисы
# разом (user, billing, gateway, sites запускаются одинаковой командой), из-за
# чего перезапуск одного ронял остальные. Здесь каждый сервис знает свой PID.
#
#   ./flux-baseline/local-stack.sh start          # поднять всё
#   ./flux-baseline/local-stack.sh restart sites  # перезапустить ОДИН сервис
#   ./flux-baseline/local-stack.sh status
#   ./flux-baseline/local-stack.sh stop
set -uo pipefail

MERFY=/Users/alexey/projects/merfy/backend/services
WORKTREE="$MERFY/sites/.worktrees/flux-constructor-live-markup"
RUN=/tmp/merfy-local-logs
mkdir -p "$RUN"

# имя:порт
# Порт конструктора — 3200: 3000 бывает занят другим проектом, а 3200 уже
# перечислен в FRONTEND_ORIGIN gateway (CORS), менять ничего не надо.
SERVICES=(user:3111 billing:3112 product:3113 gateway:3110 sites:3114 constructor:3200)

port_of() { local s=$1; for e in "${SERVICES[@]}"; do [ "${e%%:*}" = "$s" ] && echo "${e##*:}" && return; done; }
pidfile() { echo "$RUN/$1.pid"; }

alive() {
  local f; f=$(pidfile "$1")
  [ -f "$f" ] || return 1
  kill -0 "$(cat "$f")" 2>/dev/null
}

health() {
  local p; p=$(port_of "$1")
  local url="http://localhost:$p/health"
  [ "$1" = "constructor" ] && url="http://localhost:$p/"
  curl -s -o /dev/null -w "%{http_code}" --max-time 4 "$url" 2>/dev/null
}

start_one() {
  local s=$1
  if alive "$s"; then echo "  $s уже работает (pid $(cat "$(pidfile "$s")"))"; return; fi
  # Порт занят кем-то, кого мы не отслеживаем (запустили руками, остался с
  # прошлого раза). Молча стартовать нельзя: новый процесс не займёт порт и
  # тихо умрёт, а отвечать продолжит СТАРЫЙ код — самый обидный вид «правка не
  # применилась». Подхватываем чужой pid и говорим, что делать.
  local occupied; occupied=$(lsof -tiTCP:"$(port_of "$s")" -sTCP:LISTEN 2>/dev/null | head -1)
  if [ -n "$occupied" ]; then
    echo "  $s: порт $(port_of "$s") уже занят процессом $occupied (не наш)."
    echo "     беру его под учёт; чтобы поднять заново — '$0 restart $s'"
    echo "$occupied" > "$(pidfile "$s")"
    return
  fi
  case "$s" in
    user|billing)
      ( cd "$MERFY/$s" && nohup node dist/src/main.js < /dev/null > "$RUN/$s.log" 2>&1 & echo $! > "$(pidfile "$s")"; disown ) ;;
    product)
      # NODE_ENV=production: в dev TypeORM synchronize пытается силой подогнать
      # дрейфанувшую локальную схему (title varchar(500) vs entity 150) и падает
      # на destructive-переделке. Прод-режим = только миграции, env читается.
      # RABBITMQ_QUEUE_PREFIX=product-service: локальный .env говорит "product",
      # а gateway/sites шлют RPC в product-service_queue — очередь оставалась
      # без консьюмера, и КАЖДЫЙ storefront-data ждал 47с двух таймаутов.
      ( cd "$MERFY/product" && NODE_ENV=production RABBITMQ_QUEUE_PREFIX=product-service \
        nohup node dist/main.js < /dev/null > "$RUN/product.log" 2>&1 & echo $! > "$(pidfile product)"; disown ) ;;
    gateway)
      ( cd "$MERFY/api-gateway" && nohup node dist/src/main.js < /dev/null > "$RUN/gateway.log" 2>&1 & echo $! > "$(pidfile gateway)"; disown ) ;;
    sites)
      # Локальный контур: конвейер themes-v2 + ТОЛЬКО локальный MinIO.
      # Гейты в коде не дадут случайно уехать в прод, но задаём явно.
      ( cd "$WORKTREE" && \
        BUILD_PIPELINE_ENABLED=true \
        S3_ENDPOINT=http://localhost:9010 \
        S3_PUBLIC_ENDPOINT=http://localhost:9010 \
        S3_ACCESS_KEY="$(docker exec merfy-minio printenv MINIO_ROOT_USER)" \
        S3_SECRET_KEY="$(docker exec merfy-minio printenv MINIO_ROOT_PASSWORD)" \
        S3_BUCKET=merfy-sites \
        MINIO_ENDPOINT=localhost MINIO_PORT=9010 MINIO_API_URL=http://localhost:9010 \
        COOLIFY_API_URL=http://127.0.0.1:9 \
        SITE_PROVISIONING_CRON_ENABLED=false \
        CONTENT_SYNC_CRON_ENABLED=false \
        BILLING_SYNC_CRON_ENABLED=false \
        NODE_ENV=development \
        nohup node dist/src/main.js < /dev/null > "$RUN/sites.log" 2>&1 & echo $! > "$(pidfile sites)"; disown ) ;;
    constructor)
      ( cd "$MERFY/constructor" && nohup npx vite --port 3200 < /dev/null > "$RUN/constructor.log" 2>&1 & echo $! > "$(pidfile constructor)"; disown ) ;;
    *) echo "  неизвестный сервис: $s"; return 1 ;;
  esac
  # `$!` — это pid подоболочки, а не самого node (её `cd … && nohup node` порождает
  # процесс уже внутри). Дожидаемся, пока порт займётся, и записываем НАСТОЯЩЕГО
  # владельца порта — иначе учёт врёт и `stop` бьёт мимо.
  local real=""
  for _ in $(seq 1 60); do
    real=$(lsof -tiTCP:"$(port_of "$s")" -sTCP:LISTEN 2>/dev/null | head -1)
    [ -n "$real" ] && break
    sleep 1
  done
  if [ -n "$real" ]; then
    echo "$real" > "$(pidfile "$s")"
    echo "  $s поднят (pid $real)"
  else
    echo "  $s НЕ поднялся за 60с — смотри $RUN/$s.log"
    return 1
  fi
}

stop_one() {
  local s=$1 f; f=$(pidfile "$s")
  local pid=""
  [ -f "$f" ] && pid=$(cat "$f")
  # Запасной путь: pid-файла нет (процесс подняли руками или файл потеряли) —
  # ищем ВЛАДЕЛЬЦА ПОРТА этого сервиса. Именно так и остаются сироты, ради
  # отстрела которых раньше звали pkill по шаблону команды, снося всё разом.
  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
    local byport; byport=$(lsof -tiTCP:"$(port_of "$s")" -sTCP:LISTEN 2>/dev/null | head -1)
    if [ -n "$byport" ]; then
      echo "  $s: pid-файла нет, нашёл владельца порта $(port_of "$s") → $byport"
      pid=$byport
    fi
  fi
  if [ -z "$pid" ]; then echo "  $s: не запущен"; rm -f "$f"; return; fi
  if kill -0 "$pid" 2>/dev/null; then
    # Убиваем ГРУППУ процессов по конкретному pid, а не по шаблону команды.
    kill "$pid" 2>/dev/null
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
    echo "  $s остановлен (был pid $pid)"
  else
    echo "  $s уже не работал"
  fi
  rm -f "$f"
}

case "${1:-status}" in
  start)
    shift
    targets=("$@"); [ ${#targets[@]} -eq 0 ] && targets=(user billing gateway sites constructor)
    for s in "${targets[@]}"; do
      start_one "$s"
      # gateway поднимаем после user/billing: он ждёт их по RabbitMQ
      [ "$s" = "billing" ] && sleep 16
    done
    sleep 20
    "$0" status
    ;;
  stop)
    shift
    targets=("$@"); [ ${#targets[@]} -eq 0 ] && targets=(constructor sites gateway billing user)
    for s in "${targets[@]}"; do stop_one "$s"; done
    ;;
  restart)
    shift
    targets=("$@"); [ ${#targets[@]} -eq 0 ] && targets=(sites)
    for s in "${targets[@]}"; do stop_one "$s"; done
    sleep 2
    for s in "${targets[@]}"; do start_one "$s"; done
    sleep 20
    "$0" status
    ;;
  status)
    echo "сервисы:"
    for e in "${SERVICES[@]}"; do
      s=${e%%:*}; p=${e##*:}
      c=$(health "$s")
      printf '  %-12s :%-5s %s\n' "$s" "$p" \
        "$([ "$c" = "000" ] || [ -z "$c" ] && echo 'НЕ ОТВЕЧАЕТ' || echo "ок ($c)")"
    done
    echo -n "  витрина      :8099  "
    c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 http://localhost:8099/ 2>/dev/null)
    [ "$c" = "000" ] && echo "НЕ ОТВЕЧАЕТ" || echo "ок ($c)"
    ;;
  *)
    echo "использование: $0 {start|stop|restart|status} [сервис ...]"
    echo "сервисы: user billing gateway sites constructor"
    exit 2
    ;;
esac
