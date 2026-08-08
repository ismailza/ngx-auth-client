import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import CodeBlock from '@theme/CodeBlock';
import Heading from '@theme/Heading';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

import styles from './index.module.css';

const configSnippet = `provideAuth(
  withKeycloak({
    url: 'https://auth.example.com',
    realm: 'my-realm',
    clientId: 'my-app',
  }),
);`;

const componentSnippet = `@Component({
  template: \`@if (auth.authenticated()) {
    Hello {{ auth.claims()?.name }}
  }\`,
})
export class Header {
  protected readonly auth = inject(AuthService);
}`;

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();

  return (
    <header className={styles.hero}>
      <div className="container">
        <div className={styles.heroInner}>
          <p className={styles.badge}>
            Angular 17–22 · MIT licensed · signals-first, zoneless-ready
          </p>

          <Heading as="h1" className={styles.title}>
            {siteConfig.title}
          </Heading>

          <p className={styles.tagline}>
            Authentication state as <strong>signals</strong>, routes protected by a{' '}
            <strong>functional guard</strong>, and feature code with no identity-provider imports.
            Ships with a Keycloak adapter, built on a provider-agnostic port.
          </p>

          <div className={styles.buttons}>
            <Link
              className="button button--primary button--lg"
              to="/docs/getting-started/quick-start"
            >
              Get started
            </Link>
            <Link className="button button--secondary button--lg" to="/docs/intro">
              Why this exists
            </Link>
          </div>

          <div className={styles.install}>
            <CodeBlock language="bash">npm install @ismailza/ngx-auth-client keycloak-js</CodeBlock>
          </div>
        </div>
      </div>
    </header>
  );
}

function Showcase() {
  return (
    <section className={styles.showcase}>
      <div className="container">
        <Heading as="h2" className={styles.showcaseHeading}>
          One provider call, then read state like any other signal
        </Heading>
        <p className={styles.showcaseLead}>
          No event subscriptions to wire up, no derived signals to maintain, and nothing in your
          components that names your identity provider.
        </p>

        <div className={styles.showcaseGrid}>
          <div className={styles.step}>
            <Heading as="h3" className={styles.stepTitle}>
              1. Configure it in <code>app.config.ts</code>
            </Heading>
            <CodeBlock language="ts">{configSnippet}</CodeBlock>
          </div>

          <div className={styles.step}>
            <Heading as="h3" className={styles.stepTitle}>
              2. Read the state in a component
            </Heading>
            <CodeBlock language="ts">{componentSnippet}</CodeBlock>
          </div>
        </div>

        <div className={styles.result}>
          <p className={styles.resultText}>
            That template updates on login, logout and token refresh — in a zoneless application
            too.
            <br />
            Meanwhile <code>authGuard</code> protects your routes by role, and{' '}
            <code>authTokenInterceptor</code> signs your API calls with a token it refreshes before
            it expires.
          </p>
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className={styles.closing}>
      <div className="container">
        <Heading as="h2">Ready to drop it in?</Heading>
        <p className={styles.closingText}>
          Install the package, add <code>provideAuth()</code> and register one interceptor. Tokens
          stay in memory, PKCE is on by default, and your tests run without a Keycloak server.
        </p>
        <Link className="button button--primary button--lg" to="/docs/getting-started/installation">
          Read the installation guide
        </Link>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();

  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <Showcase />
        <Closing />
      </main>
    </Layout>
  );
}
