module.exports = {
  fileExtensions: ['ts', 'tsx'],
  tsConfig: './tsconfig.json',
  excludeRegExp: [/\.d\.ts$/, /node_modules/, /dist/, /\.legacy/],
  detectiveOptions: {
    ts: { skipTypeImports: true },
    tsx: { skipTypeImports: true },
  },
};
