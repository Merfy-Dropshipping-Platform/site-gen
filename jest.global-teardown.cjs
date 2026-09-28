/** Отпустить очередь на машину, взятую в jest.global-setup.cjs. */
module.exports = async function globalTeardown() {
  globalThis.__merfyMachineLock?.release();
};
