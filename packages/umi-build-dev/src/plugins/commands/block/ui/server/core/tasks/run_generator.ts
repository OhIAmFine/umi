import { winPath } from 'umi-utils';
import { join } from 'path';
import { IFlowContext, IAddBlockOption } from '../types';

const generatorFunc = async (ctx: IFlowContext, args: IAddBlockOption) => {
  const { logger, api } = ctx;
  const { debug } = api;

  const { dryRun, page: isPage, js, execution = 'shell', uni18n } = args;

  logger.start('🔥  Generate files');
  logger.stopAndPersist();

  const getBlockGenerator = require('../../../../getBlockGenerator');
  const BlockGenerator = getBlockGenerator.default(ctx.api);

  const { pkg, sourcePath, filePath, routePath, templateTmpDirPath } = ctx.stages.blockCtx;

  let isPageBlock = pkg.blockConfig && pkg.blockConfig.specVersion === '0.1';
  if (isPage !== undefined) {
    // when user use `umi block add --page`
    isPageBlock = isPage;
  }
  debug(`isPageBlock: ${isPageBlock}`);

  const latestPkgPath = winPath(join(__dirname, '../../../../../../../../package.json'));

  const generator = new BlockGenerator(args._ ? args._.slice(2) : [], {
    sourcePath,
    path: filePath,
    routePath,
    blockName: args.name || getBlockGenerator.getNameFromPkg(pkg),
    isPageBlock,
    dryRun,
    execution,
    env: {
      cwd: api.cwd,
    },
    resolved: latestPkgPath,
  });
  try {
    await generator.run();
  } catch (e) {
    logger.fail();
    throw new Error(e);
  }

  // write dependencies
  if (pkg.blockConfig && pkg.blockConfig.dependencies) {
    const subBlocks = pkg.blockConfig.dependencies;
    try {
      await Promise.all(
        subBlocks.map((block: string) => {
          const subBlockPath = join(templateTmpDirPath, block);
          debug(`subBlockPath: ${subBlockPath}`);
          return new BlockGenerator(args._.slice(2), {
            sourcePath: subBlockPath,
            path: isPageBlock ? generator.path : join(generator.path, generator.blockFolderName),
            blockName: getBlockGenerator.getNameFromPkg(
              // eslint-disable-next-line
              require(join(subBlockPath, 'package.json')),
            ),
            isPageBlock: false,
            dryRun,
            env: {
              cwd: api.cwd,
            },
            routes: api.config.routes,
            resolved: latestPkgPath,
          }).run();
        }),
      );
    } catch (e) {
      logger.fail();
      throw new Error(e);
    }
  }
  logger.succeed();

  // 调用 sylvanas 转化 ts
  if (js) {
    // opts.remoteLog('TypeScript to JavaScript'); // TODO: add log
    logger.start('🤔  TypeScript to JavaScript');
    require('../../../../tsTojs').default(generator.blockFolderPath);
    logger.succeed();
  }

  if (uni18n) {
    logger.start('🌎  remove i18n code');
    require('./remove-locale').default(generator.blockFolderPath, uni18n);
    logger.succeed();
  }

  ctx.stages.generator = generator;
};

export default generatorFunc;
