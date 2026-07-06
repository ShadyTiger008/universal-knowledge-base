import { IsString, IsNotEmpty, IsOptional, IsUUID, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class QueryDto {
  @ApiProperty({ description: 'User question / query text' })
  @IsString()
  @IsNotEmpty()
  question: string;

  @ApiPropertyOptional({ description: 'User ID making the query' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Scope search to a specific document' })
  @IsOptional()
  @IsUUID()
  documentId?: string;

  @ApiPropertyOptional({ description: 'Number of similar chunks to retrieve', default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  topK?: number;
}
