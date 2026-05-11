const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const projectRoot = __dirname;
const backendFunctionsRoot = path.resolve(projectRoot, 'functions');

// Ignore the backend Cloud Functions workspace without blocking package
// internals like node_modules/semver/functions/* that Metro needs to hash.
config.resolver.blockList = [
  new RegExp(`^${backendFunctionsRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/.*`),
];

module.exports = config;
