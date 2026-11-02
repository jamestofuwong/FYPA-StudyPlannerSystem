const { startEmbeddedDb } = require('../helpers/embeddedDb');

module.exports = async () => {
  const db = await startEmbeddedDb({ desktop: true });
  process.env.TEST_DESKTOP_DB_URL = db.desktopUrl;
  globalThis.__TEST_DB__ = db;
};
