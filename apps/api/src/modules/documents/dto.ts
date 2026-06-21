import { IsOptional, IsString } from "class-validator";

export class CreateDocumentDto {
  @IsString()
  title!: string;
  @IsString()
  @IsOptional()
  folderId?: string;
}