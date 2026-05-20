import { Module, Global } from '@nestjs/common';

@Global()
@Module({
  providers: [
    // Temporarily disabled TransformInterceptor to fix infinite recursion
    // {
    //   provide: APP_INTERCEPTOR,
    //   useClass: TransformInterceptor,
    // },
  ],
  exports: [],
})
export class CommonModule {}
