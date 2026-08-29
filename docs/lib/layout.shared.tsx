import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';
import { appName, gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Image src="/logo.png" alt={appName} width={24} height={24} className="block dark:hidden" priority />
          <Image
            src="/logo-dark.png"
            alt={appName}
            width={24}
            height={24}
            className="hidden dark:block"
            priority
          />
          <span className="font-medium">{appName}</span>
        </>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
