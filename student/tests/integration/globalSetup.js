const { startEmbeddedDb } = require('../../../tests/helpers/embeddedDb');

module.exports = async () => {
  const db = await startEmbeddedDb({ student: true });
  process.env.TEST_STUDENT_DB_URL = db.studentUrl;
  globalThis.__TEST_DB__ = db;
};
