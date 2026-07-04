import { Global, Module } from '@nestjs/common';
import { ParserService } from './parsers/parser.service';

@Global()
@Module({
  providers: [ParserService],
  exports: [ParserService],
})
export class CommonModule {}
