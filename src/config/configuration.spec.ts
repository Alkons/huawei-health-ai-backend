import configuration from './configuration';

describe('Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return default configuration', () => {
    const config = configuration();
    expect(config).toBeDefined();
    expect(config.server.port).toBe(3005);
    expect(config.database.uri).toBe(
      'mongodb://localhost:27017/huawei-health-ai-backend',
    );
  });

  it('should return configuration from environment variables', () => {
    process.env.SERVER_PORT = '4000';
    process.env.CONNECTION_STRING = 'mongodb://test:27017/test';

    // We need to re-import the configuration to pick up env changes if it reads them at top level?
    // configuration is a function, so calling it again should read env.
    const config = configuration();

    expect(config.server.port).toBe(4000);
    expect(config.database.uri).toBe('mongodb://test:27017/test');
  });
});
