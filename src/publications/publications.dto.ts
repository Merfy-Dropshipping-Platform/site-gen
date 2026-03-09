import {
  IsString,
  IsOptional,
  IsIn,
  IsUUID,
  IsDateString,
  MaxLength,
} from "class-validator";

export class CreatePublicationDto {
  @IsUUID()
  shopId!: string;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsIn(["news", "blog", "articles"])
  category!: "news" | "blog" | "articles";

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsIn(["draft", "scheduled", "published"])
  status?: "draft" | "scheduled" | "published";

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdatePublicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsIn(["news", "blog", "articles"])
  category?: "news" | "blog" | "articles";

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsIn(["draft", "scheduled", "published", "archived"])
  status?: "draft" | "scheduled" | "published" | "archived";

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
