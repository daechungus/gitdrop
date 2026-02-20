import chalk from 'chalk';

export const log = {
  info:    (msg: string) => console.log(chalk.blue('[info]  ') + msg),
  success: (msg: string) => console.log(chalk.green('[done]  ') + msg),
  warn:    (msg: string) => console.log(chalk.yellow('[warn]  ') + msg),
  error:   (msg: string) => console.log(chalk.red('[error] ') + msg),
  dim:     (msg: string) => console.log(chalk.gray(msg)),
  bold:    (msg: string) => console.log(chalk.bold(msg)),
};
