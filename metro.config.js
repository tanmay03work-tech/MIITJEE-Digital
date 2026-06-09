const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const escapeForRegex = (value) => value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
const root = escapeForRegex(__dirname);
const sep = '(?:\\\\|\\/)';

const config = {
  maxWorkers: 1,
  stickyWorkers: false,
  resolver: {
    blockList: [
      new RegExp(`${root}${sep}node_modules_old${sep}.*`),
      new RegExp(`${root}${sep}miitjee-backend${sep}.*`),
      new RegExp(`${root}${sep}toolchains${sep}.*`),
      new RegExp(`${root}${sep}tmp-native${sep}.*`),
      new RegExp(`${root}${sep}android${sep}app${sep}build${sep}.*`),
      new RegExp(`${root}${sep}android${sep}build${sep}.*`),
      new RegExp(`${root}${sep}\\.gradle[^\\\\/]*${sep}.*`),
      new RegExp(`${root}${sep}\\.tmp${sep}.*`),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
