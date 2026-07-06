import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QueryDto {
  @ApiProperty({ description: 'User question / query text' })
  @IsString()
  @IsNotEmpty()
  question: string;
}
