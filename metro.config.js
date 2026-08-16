const path = require('path');
const { FileStore } = require('metro-cache');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const escapeForRegex = (value) => value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
const root = escapeForRegex(__dirname);
const sep = '(?:\\\\|\\/)';

const config = {
  cacheStores: [
    new FileStore({ root: path.join(__dirname, '.metro-cache') }),
  ],
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
