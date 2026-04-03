import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { rootEnvFilePath } from './config/root-env-path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: rootEnvFilePath,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
