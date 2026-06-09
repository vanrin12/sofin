import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { privateKey, publicKey } from '../keys';
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
  providers: [AuthService, UsersStore],
})
export class AuthModule {}
