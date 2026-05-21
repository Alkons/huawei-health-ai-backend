import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HuaweiService } from './huawei.service';
import {
  HuaweiConnection,
  HuaweiConnectionDocument,
} from './schemas/huawei-connection.schema';

@Injectable()
export class HuaweiSyncScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(HuaweiSyncScheduler.name);
  private intervalId?: NodeJS.Timeout;

  constructor(
    private readonly huaweiService: HuaweiService,
    @InjectModel(HuaweiConnection.name)
    private readonly connectionModel: Model<HuaweiConnectionDocument>,
  ) {}

  onApplicationBootstrap() {
    this.logger.log('Starting background sync scheduler (every 30 minutes)...');
    // Run sync on startup after a small delay, then every 30 minutes
    setTimeout(() => {
      this.runBackgroundSync().catch((err: unknown) =>
        this.logger.error('Initial background sync failed', err),
      );
    }, 5000);
    this.intervalId = setInterval(
      () => {
        this.runBackgroundSync().catch((err: unknown) =>
          this.logger.error('Periodic background sync failed', err),
        );
      },
      30 * 60 * 1000,
    );
  }

  onApplicationShutdown() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async runBackgroundSync(): Promise<void> {
    this.logger.log('Running periodic background synchronization...');
    try {
      const connectedUsers = await this.connectionModel
        .find({ status: 'connected' })
        .select('userId')
        .lean();

      this.logger.log(
        `Found ${connectedUsers.length} connected users to sync.`,
      );

      for (const connection of connectedUsers) {
        const userIdStr = connection.userId.toString();
        this.logger.log(`Background sync started for user ${userIdStr}`);
        try {
          await this.huaweiService.syncAllEnabledCategories(userIdStr);
          this.logger.log(`Background sync completed for user ${userIdStr}`);
        } catch (err) {
          this.logger.error(
            `Failed to background sync user ${userIdStr}:`,
            err,
          );
        }
      }
    } catch (err) {
      this.logger.error('Failed to run background sync job:', err);
    }
  }
}
