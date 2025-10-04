const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    background: './src/background.ts',
    content: './src/content.ts',
    viewer: './src/viewer.ts'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/viewer.html', to: 'viewer.html' },
        { from: 'src/viewer.css', to: 'viewer.css' },
        { from: 'icons', to: 'icons', noErrorOnMissing: true },
        {
          from: 'node_modules/pdfjs-dist/build/pdf.worker.mjs',
          to: 'pdf.worker.mjs'
        }
      ],
    }),
  ],
  optimization: {
    minimize: false
  }
};
