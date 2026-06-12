const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/crm'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      optimization: false,
      outputHashing: 'none',
      sourceMap: true,
      generatePackageJson: false,
      // Run the NestJS Swagger CLI plugin as a TS transformer so DTO schemas
      // are introspected (this repo names DTO files `dto.ts`, not `*.dto.ts`).
      transformers: [
        {
          name: '@nestjs/swagger/plugin',
          options: { dtoFileNameSuffix: ['dto.ts', '.entity.ts'], introspectComments: true },
        },
      ],
    }),
  ],
};
