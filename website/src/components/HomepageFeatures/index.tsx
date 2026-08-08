import type { ComponentProps, ReactNode } from 'react';
import Heading from '@theme/Heading';

import styles from './styles.module.css';

type IconProps = ComponentProps<'svg'>;

/** Decorative line icons — hidden from assistive tech, the heading carries the meaning. */
const Icon = ({ children, ...props }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    {children}
  </svg>
);

type FeatureItem = {
  title: string;
  icon: ReactNode;
  description: ReactNode;
};

const features: FeatureItem[] = [
  {
    title: 'State as signals',
    icon: (
      <Icon className={styles.icon}>
        <path d="M3 17c3-9 6-9 9 0s6 9 9 0" />
        <circle cx="12" cy="12" r="1.4" />
      </Icon>
    ),
    description: (
      <>
        <code>authenticated()</code>, <code>claims()</code>, <code>roles()</code> and{' '}
        <code>profile()</code> are signals, so templates update on login, logout and refresh —
        including in a zoneless application, where getter-based state never re-renders.
      </>
    ),
  },
  {
    title: 'Routes guarded by role',
    icon: (
      <Icon className={styles.icon}>
        <path d="M12 3 20 6v6c0 4.4-3.2 8-8 9.6C8 20 4.8 16.4 4.8 12V6Z" />
        <path d="m9 12 2.2 2.2L15.5 10" />
      </Icon>
    ),
    description: (
      <>
        A functional <code>authGuard</code> with <code>anyOf</code> and <code>allOf</code>{' '}
        requirements that <strong>accumulate down the route tree</strong> — so a protected section
        is configured once, at its root.
      </>
    ),
  },
  {
    title: 'Tokens never persisted',
    icon: (
      <Icon className={styles.icon}>
        <rect x="4" y="10.5" width="16" height="10" rx="2" />
        <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        <path d="M12 14.5v2" />
      </Icon>
    ),
    description: (
      <>
        Nothing is written to <code>localStorage</code> or <code>sessionStorage</code>, where an XSS
        payload could read it. Continuity comes from the provider&apos;s SSO cookie, and PKCE{' '}
        <code>S256</code> is on by default.
      </>
    ),
  },
  {
    title: 'An allowlist for bearer tokens',
    icon: (
      <Icon className={styles.icon}>
        <path d="M4 12h5" />
        <path d="M15 12h5" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 4v2" />
        <path d="M12 18v2" />
      </Icon>
    ),
    description: (
      <>
        The interceptor signs only the requests you name, refreshing the token first when it is near
        expiry. A pattern matching nothing attaches nothing — it <strong>fails closed</strong>{' '}
        rather than leaking a token to a third-party host.
      </>
    ),
  },
  {
    title: 'Provider-agnostic by design',
    icon: (
      <Icon className={styles.icon}>
        <path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" />
        <path d="m3 7.5 9 4.5 9-4.5" />
        <path d="M12 12v9" />
      </Icon>
    ),
    description: (
      <>
        Three signals and four methods is the whole port. Roles are normalised by the adapter,
        optional features are feature-detected rather than faked, and swapping identity provider
        stays a one-file change.
      </>
    ),
  },
  {
    title: 'Tests without a server',
    icon: (
      <Icon className={styles.icon}>
        <path d="M9 3h6" />
        <path d="M10 3v6.2L5.6 17A2.6 2.6 0 0 0 7.9 21h8.2a2.6 2.6 0 0 0 2.3-4L14 9.2V3" />
        <path d="M7.5 15h9" />
      </Icon>
    ),
    description: (
      <>
        <code>withFakeAuth()</code> swaps in an in-memory adapter — a real implementation of the
        same port, not a stub. No Keycloak server, no mocked <code>window.location</code>, same code
        paths.
      </>
    ),
  },
];

function Feature({ title, icon, description }: FeatureItem) {
  return (
    <div className={styles.card}>
      {icon}
      <Heading as="h3" className={styles.cardTitle}>
        {title}
      </Heading>
      <p className={styles.cardBody}>{description}</p>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <Heading as="h2" className={styles.sectionHeading}>
          The layer every Angular app writes by hand
        </Heading>
        <p className={styles.sectionLead}>
          Deriving reactive auth state, guarding routes by role, signing requests and keeping tokens
          out of storage — written once, and kept behind a port you can swap.
        </p>

        <div className={styles.grid}>
          {features.map((feature) => (
            <Feature key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}
