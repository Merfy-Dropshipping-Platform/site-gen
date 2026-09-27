/**
 * «Основные данные» личного кабинета — без поля «Пароль» во всех темах.
 *
 * Покупатель входит в кабинет по Magic Link (ссылка на почту), пароля у него
 * нет. Поле «Пароль» с точками и ссылкой «Изменить» на /reset-password
 * показывало несуществующий пароль (владелец 27.09: «пароль нужно убрать»).
 *
 * Секция рендерится тем же рендером, что витрина (renderSections, живая цепочка).
 */
import { parse } from "node-html-parser";
import { renderSections } from "../../../scripts/qa/lib/render";

const THEMES = ["rose", "vanilla", "satin", "bloom", "flux"] as const;

const render = (theme: string) => {
  const [r] = renderSections(theme, [{ block: "AccountSection", props: { id: "AccountSection-1" } }]);
  if (r.error) throw new Error(`${theme}: ${r.error}`);
  return parse(r.html ?? "");
};

describe("«Основные данные» без поля пароля", () => {
  it.each(THEMES)("%s", (theme) => {
    const root = render(theme);
    // Контроль: секция действительно отрендерилась, иначе «пароля нет» — впустую.
    expect(root.querySelector("#profile-form")).not.toBeNull();
    expect(root.querySelector("#profile-email")).not.toBeNull();

    const labels = root.querySelectorAll("label").map((l) => l.text.trim());
    expect(labels).not.toContain("Пароль");
    expect(root.querySelector('a[href="/reset-password"]')).toBeNull();
    expect(root.text).not.toContain("••••");
  });
});
