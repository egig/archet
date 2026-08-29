import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt={appName}
            width={24}
            height={24}
            className="block dark:hidden"
          />
          <img
            src={`${import.meta.env.BASE_URL}logo-dark.png`}
            alt={appName}
            width={24}
            height={24}
            className="hidden dark:block"
          />
          <span className="font-medium">{appName}</span>
        </>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
