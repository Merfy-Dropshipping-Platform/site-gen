import { Inject, Injectable, Logger } from "@nestjs/common";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "../db/schema";
import { PG_CONNECTION } from "../constants";
import { BuildQueuePublisher } from "../rabbitmq/build-queue.service";

type PublicationStatus = "draft" | "scheduled" | "published" | "archived";
type PublicationCategory = "news" | "blog" | "articles";

// --- Slug generation (T007) ---

const CYRILLIC_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
  з: "z", и: "i", й: "j", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

function transliterate(input: string): string {
  return input
    .split("")
    .map((char) => {
      const lower = char.toLowerCase();
      return CYRILLIC_MAP[lower] ?? lower;
    })
    .join("");
}

function slugify(input: string): string {
  return transliterate(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 200);
}

// --- State transition validation (T008) ---

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["published", "scheduled"],
  scheduled: ["draft", "published"],
  published: ["archived"],
  archived: ["draft"],
};

function validateTransition(from: string, to: string): string | null {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    return `Transition from '${from}' to '${to}' is not allowed. Allowed: ${allowed?.join(", ") ?? "none"}`;
  }
  return null;
}

// --- Service (T006) ---

@Injectable()
export class PublicationsService {
  private readonly logger = new Logger(PublicationsService.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly buildQueue: BuildQueuePublisher,
  ) {}

  async create(params: {
    organizationId: string;
    siteId: string;
    title: string;
    category: PublicationCategory;
    content: string;
    excerpt?: string;
    coverImageUrl?: string;
    status?: PublicationStatus;
    scheduledAt?: string;
  }) {
    const id = randomUUID();
    const baseSlug = slugify(params.title);
    const slug = await this.ensureUniqueSlug(baseSlug, params.siteId);

    const excerpt =
      params.excerpt ||
      params.content.replace(/<[^>]*>/g, "").substring(0, 200);

    const status: PublicationStatus = params.status || "draft";

    if (status === "scheduled" && !params.scheduledAt) {
      throw new Error("scheduledAt is required when status is 'scheduled'");
    }

    const now = new Date();
    const publishedAt = status === "published" ? now : null;

    const [result] = await this.db
      .insert(schema.publications)
      .values({
        id,
        organizationId: params.organizationId,
        siteId: params.siteId,
        title: params.title,
        slug,
        category: params.category,
        content: params.content,
        excerpt,
        coverImageUrl: params.coverImageUrl || null,
        status,
        scheduledAt: params.scheduledAt ? new Date(params.scheduledAt) : null,
        publishedAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (status === "published") {
      await this.triggerRebuild(params.organizationId, params.siteId);
    }

    return result;
  }

  async findAll(params: {
    organizationId: string;
    siteId: string;
    status?: string;
    category?: string;
    page?: number;
    limit?: number;
    sort?: string;
    publishedOnly?: boolean;
  }) {
    const {
      organizationId,
      siteId,
      status,
      category,
      page = 1,
      limit = 20,
      sort = "createdAt:desc",
      publishedOnly = false,
    } = params;

    const conditions = [
      eq(schema.publications.organizationId, organizationId),
      eq(schema.publications.siteId, siteId),
    ];

    if (publishedOnly) {
      conditions.push(eq(schema.publications.status, "published"));
    } else if (status) {
      conditions.push(
        eq(schema.publications.status, status as any),
      );
    }

    if (category) {
      conditions.push(
        eq(schema.publications.category, category as any),
      );
    }

    const [sortField, sortDir] = sort.split(":");
    const sortColumn =
      sortField === "publishedAt"
        ? schema.publications.publishedAt
        : sortField === "title"
          ? schema.publications.title
          : schema.publications.createdAt;
    const orderFn = sortDir === "asc" ? asc : desc;

    const offset = (page - 1) * Math.min(limit, 100);
    const safeLimit = Math.min(limit, 100);

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(schema.publications)
        .where(and(...conditions))
        .orderBy(orderFn(sortColumn))
        .limit(safeLimit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.publications)
        .where(and(...conditions)),
    ]);

    return { data, total: countResult[0]?.count ?? 0 };
  }

  async findOne(id: string, organizationId: string) {
    const [result] = await this.db
      .select()
      .from(schema.publications)
      .where(
        and(
          eq(schema.publications.id, id),
          eq(schema.publications.organizationId, organizationId),
        ),
      )
      .limit(1);
    return result || null;
  }

  async findBySlug(slug: string, siteId: string, organizationId: string) {
    const [result] = await this.db
      .select()
      .from(schema.publications)
      .where(
        and(
          eq(schema.publications.slug, slug),
          eq(schema.publications.siteId, siteId),
          eq(schema.publications.organizationId, organizationId),
        ),
      )
      .limit(1);
    return result || null;
  }

  async update(
    id: string,
    organizationId: string,
    data: {
      title?: string;
      category?: string;
      content?: string;
      excerpt?: string;
      coverImageUrl?: string;
      status?: string;
      scheduledAt?: string;
    },
  ) {
    const existing = await this.findOne(id, organizationId);
    if (!existing) return null;

    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.content !== undefined) {
      updateData.content = data.content;
      if (!data.excerpt) {
        updateData.excerpt = data.content
          .replace(/<[^>]*>/g, "")
          .substring(0, 200);
      }
    }
    if (data.excerpt !== undefined) updateData.excerpt = data.excerpt;
    if (data.coverImageUrl !== undefined)
      updateData.coverImageUrl = data.coverImageUrl;
    if (data.scheduledAt !== undefined)
      updateData.scheduledAt = data.scheduledAt
        ? new Date(data.scheduledAt)
        : null;

    // State transition validation
    let needsRebuild = false;
    if (data.status && data.status !== existing.status) {
      const error = validateTransition(existing.status, data.status);
      if (error) throw new Error(error);

      updateData.status = data.status;

      if (data.status === "published") {
        updateData.publishedAt = new Date();
        needsRebuild = true;
      }
      if (data.status === "archived") {
        needsRebuild = true;
      }
      if (data.status === "scheduled" && !data.scheduledAt && !existing.scheduledAt) {
        throw new Error("scheduledAt is required for scheduled status");
      }
    }

    const [result] = await this.db
      .update(schema.publications)
      .set(updateData)
      .where(
        and(
          eq(schema.publications.id, id),
          eq(schema.publications.organizationId, organizationId),
        ),
      )
      .returning();

    if (needsRebuild) {
      await this.triggerRebuild(organizationId, existing.siteId);
    }

    return result;
  }

  async delete(id: string, organizationId: string, siteId: string) {
    const existing = await this.findOne(id, organizationId);
    if (!existing) return false;

    await this.db
      .delete(schema.publications)
      .where(
        and(
          eq(schema.publications.id, id),
          eq(schema.publications.organizationId, organizationId),
        ),
      );

    if (existing.status === "published") {
      await this.triggerRebuild(organizationId, siteId);
    }

    return true;
  }

  // Used by data-fetcher (same service, direct call)
  async findPublished(siteId: string, organizationId: string) {
    const data = await this.db
      .select()
      .from(schema.publications)
      .where(
        and(
          eq(schema.publications.siteId, siteId),
          eq(schema.publications.organizationId, organizationId),
          eq(schema.publications.status, "published"),
        ),
      )
      .orderBy(desc(schema.publications.publishedAt));
    return data;
  }

  // Used by cron to auto-publish scheduled publications
  async publishScheduled() {
    const now = new Date();
    const scheduled = await this.db
      .select()
      .from(schema.publications)
      .where(
        and(
          eq(schema.publications.status, "scheduled"),
          sql`${schema.publications.scheduledAt} <= ${now}`,
        ),
      );

    const affectedSites = new Set<string>();

    for (const pub of scheduled) {
      await this.db
        .update(schema.publications)
        .set({
          status: "published",
          publishedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.publications.id, pub.id));

      affectedSites.add(`${pub.organizationId}:${pub.siteId}`);
      this.logger.log(`Auto-published: ${pub.title} (${pub.id})`);
    }

    for (const key of affectedSites) {
      const [orgId, siteId] = key.split(":");
      await this.triggerRebuild(orgId, siteId);
    }

    return scheduled.length;
  }

  private async ensureUniqueSlug(
    baseSlug: string,
    siteId: string,
  ): Promise<string> {
    let slug = baseSlug || "publication";
    let suffix = 0;

    while (true) {
      const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
      const [existing] = await this.db
        .select({ id: schema.publications.id })
        .from(schema.publications)
        .where(
          and(
            eq(schema.publications.slug, candidate),
            eq(schema.publications.siteId, siteId),
          ),
        )
        .limit(1);

      if (!existing) return candidate;
      suffix++;
    }
  }

  private async triggerRebuild(tenantId: string, siteId: string) {
    try {
      await this.buildQueue.queueBuild({
        tenantId,
        siteId,
        priority: 5,
        trigger: "publication_change",
      });
      this.logger.log(`Rebuild queued for site ${siteId}`);
    } catch (err: any) {
      this.logger.error(`Failed to queue rebuild: ${err.message}`);
    }
  }
}
