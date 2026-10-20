/**
 * Тело записи (справочно; RPC принимает payload как есть, проверки — в
 * `publication-rules.ts` с кодами ошибок). Контракт «Публикации», 20.10.2026.
 */
import {
  IsString,
  IsOptional,
  IsIn,
  IsUUID,
  IsDateString,
  MaxLength,
  Matches,
} from "class-validator";
import {
  EXCERPT_MAX,
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  SLUG_MAX,
  SLUG_PATTERN,
} from "./publication-rules";

export class CreatePublicationDto {
  @IsUUID()
  shopId!: string;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  blogId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  newBlogTitle?: string;

  /** @deprecated news|blog|articles → блог по таблице миграции 0027. */
  @IsOptional()
  @IsIn(["news", "blog", "articles"])
  category?: "news" | "blog" | "articles";

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(EXCERPT_MAX)
  excerpt?: string | null;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsIn(["draft", "scheduled", "published", "archived"])
  status?: "draft" | "scheduled" | "published" | "archived";

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;

  @IsOptional()
  @MaxLength(SLUG_MAX)
  @Matches(SLUG_PATTERN)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SEO_TITLE_MAX)
  seoTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(SEO_DESCRIPTION_MAX)
  seoDescription?: string | null;
}

export class UpdatePublicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  blogId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  newBlogTitle?: string;

  /** @deprecated news|blog|articles → блог по таблице миграции 0027. */
  @IsOptional()
  @IsIn(["news", "blog", "articles"])
  category?: "news" | "blog" | "articles";

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(EXCERPT_MAX)
  excerpt?: string | null;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsIn(["draft", "scheduled", "published", "archived"])
  status?: "draft" | "scheduled" | "published" | "archived";

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;

  @IsOptional()
  @MaxLength(SLUG_MAX)
  @Matches(SLUG_PATTERN)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SEO_TITLE_MAX)
  seoTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(SEO_DESCRIPTION_MAX)
  seoDescription?: string | null;
}
