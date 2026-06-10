import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OUTBOX_PRISMA, OutboxRelay } from '@app/common';
import { privateKey, publicKey } from '../keys';
import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersStore } from './users.store';

@Module({
  imports: [
    JwtModule.register({
      // sign with the RSA private key; tokens are verifiable with the public key
      privateKey,
      publicKey,
      signOptions: {
        algorithm: 'RS256',
        expiresIn: Number(process.env.ACCESS_TOKEN_TTL || 900),
        issuer: process.env.TOKEN_ISSUER || 'sofin-auth',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    UsersStore,
    OutboxRelay,
    { provide: OUTBOX_PRISMA, useExisting: PrismaService },
  ],
})
export class AuthModule {}
