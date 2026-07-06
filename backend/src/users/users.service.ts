import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Platform } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    platform?: Platform;
    platformUserId?: string;
    name?: string;
    limit?: number;
    offset?: number;
  }) {
    const { platform, platformUserId, name, limit = 100, offset = 0 } = params;

    const where: Record<string, unknown> = {};
    if (platform) where.platform = platform;
    if (platformUserId) where.platformUserId = platformUserId;
    if (name) where.name = { contains: name, mode: 'insensitive' };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, limit, offset };
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
