process.env.CMS_JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.DATABASE_URL = process.env.TEST_STUDENT_DB_URL;
delete process.env.DATABASE_URL_UNPOOLED;
