import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Platform } from '@prisma/client';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiQuery({ name: 'platform', required: false, enum: Platform })
  @ApiQuery({ name: 'platformUserId', required: false })
  @ApiQuery({ name: 'name', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async findAll(
    @Query('platform') platform?: Platform,
    @Query('platformUserId') platformUserId?: string,
    @Query('name') name?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const params = {
      platform,
      platformUserId,
      name,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };

    console.log('[UsersController] findAll called with params:', params);

    const result = await this.usersService.findAll(params);

    return {
      input: params,
      ...result,
    };
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    console.log('[UsersController] findById called with id:', id);

    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }

    return {
      input: { id },
      user,
    };
  }
}
