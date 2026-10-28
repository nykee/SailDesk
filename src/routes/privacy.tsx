import { createFileRoute } from '@tanstack/react-router';
import { websiteConfig } from '@/config/website';

/**
 * Public privacy policy. Google requires this page to be reachable without
 * authentication and hosted on the same domain as the OAuth home page.
 */
export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      { title: 'Privacy Policy · SailDesk' },
      {
        name: 'description',
        content:
          'How SailDesk accesses, uses and stores Google and Bing webmaster data.',
      },
    ],
    links: [{ rel: 'canonical', href: '/privacy' }],
  }),
  component: PrivacyPage,
});

const UPDATED = '2026-10-27';

function PrivacyPage() {
  return (
    <main className="policy-screen">
      <article className="policy-panel">
        <p className="eyebrow">PRIVACY POLICY</p>
        <h1>隐私政策 / Privacy Policy</h1>
        <p className="policy-meta">最后更新 / Last updated: {UPDATED}</p>

        <section>
          <h2>What this application is</h2>
          <p>
            SailDesk is a self-hosted, single-operator dashboard. Each operator
            runs their own instance and authorizes it with their own Google
            account. It displays Google Search Console performance, Google
            Analytics 4 traffic and Bing Webmaster data for the website
            properties that its operator already owns. It is not a public
            product and does not accept sign-ups from other users.
          </p>
          <p>
            本看板是自托管工具，每位运营者运行自己的实例，并用本人的 Google
            账号完成授权。它仅供运营者本人查看自己名下网站的 Google Search
            Console 搜索表现、Google Analytics 4 流量与 Bing Webmaster
            数据。它不是面向公众的产品，不接受其他用户注册。
          </p>
        </section>

        <section>
          <h2>Data accessed</h2>
          <p>
            With the operator&rsquo;s explicit consent, this application
            requests the read-only scopes{' '}
            <code>https://www.googleapis.com/auth/webmasters.readonly</code> and{' '}
            <code>https://www.googleapis.com/auth/analytics.readonly</code>. It
            reads, and only reads, data for properties the authorizing Google
            account already has access to: Search Console site lists, clicks,
            impressions, click-through rate, average position, and query or page
            breakdowns; and Google Analytics 4 sessions, users, pageviews,
            engagement metrics, traffic sources, and top pages.
          </p>
          <p>
            经运营者明确授权后，本应用仅申请 <code>webmasters.readonly</code> 与{' '}
            <code>analytics.readonly</code>{' '}
            两个只读权限，读取授权账号本就有权访问的数据：Search Console
            的站点列表、点击、曝光、点击率、平均排名以及查询词与页面明细；Google
            Analytics 4
            的会话、用户、浏览量、互动指标、流量来源与热门页面。不会写入、修改或删除任何
            Google 数据。
          </p>
          <p>
            Bing Webmaster data is optional and only read when the operator
            supplies their own Bing Webmaster API key: site lists, clicks,
            impressions, average position, and query or page breakdowns. The key
            is stored as a Cloudflare Workers Secret and never reaches the
            browser.
          </p>
          <p>
            Bing Webmaster 数据为可选项，仅在运营者自行配置 Bing Webmaster API
            密钥时读取：站点列表、点击、曝光、平均排名以及查询词与页面明细。该密钥存放于
            Cloudflare Workers Secret，不会发送到浏览器。
          </p>
        </section>

        <section>
          <h2>How the data is used</h2>
          <p>
            Data is used solely to render charts and tables in this dashboard
            for the operator&rsquo;s own analysis. It is not used for
            advertising, not sold, not used to train machine learning models,
            and not transferred to any third party.
          </p>
          <p>
            数据仅用于在本看板中呈现图表与表格，供运营者本人分析。不用于广告，不出售，不用于训练机器学习模型，不转让给任何第三方。
          </p>
        </section>

        <section>
          <h2>Storage and retention</h2>
          <p>
            The only Google credential stored is an OAuth refresh token, kept in
            a Cloudflare Workers Secret. It never reaches the browser. Search
            Console and Analytics metrics are fetched on demand and held only in
            memory for the duration of a request; they are not written to a
            database, object storage, or logs. Bing responses are cached in
            Cloudflare KV for up to seven days so the dashboard can serve them
            without calling Bing on every page load; that cache contains only
            aggregate webmaster metrics, never credentials. Access to the
            dashboard itself is gated by a password chosen by the operator.
          </p>
          <p>
            唯一被保存的 Google 凭据是 OAuth refresh token，存放于 Cloudflare
            Workers Secret，不会发送到浏览器。Search Console 与 Analytics
            指标按需实时拉取，仅在单次请求的内存中存在，不写入数据库、对象存储或日志。Bing
            的响应会缓存于 Cloudflare KV，最长 7 天，以避免每次打开看板都请求
            Bing；该缓存只含汇总后的站长指标，不含任何凭据。看板访问由运营者设定的密码保护。
          </p>
        </section>

        <section>
          <h2>Sharing</h2>
          <p>
            No Google or Bing user data is shared with third parties. The
            application makes no outbound requests other than to Google&rsquo;s
            own OAuth, Search Console and Analytics APIs, and to the Bing
            Webmaster API when the operator has configured a key.
          </p>
          <p>
            不与任何第三方共享 Google 或 Bing 用户数据。除 Google 自身的
            OAuth、Search Console、Analytics 接口，以及运营者配置密钥后的 Bing
            Webmaster 接口外，本应用不向其他服务发起请求。
          </p>
        </section>

        <section>
          <h2>Revoking access and deleting data</h2>
          <p>
            The authorizing account holder can revoke access at any time at{' '}
            <a
              href="https://myaccount.google.com/permissions"
              rel="noreferrer"
              target="_blank"
            >
              myaccount.google.com/permissions
            </a>
            . Revoking access immediately invalidates the stored refresh token,
            and the dashboard stops being able to read Search Console data. No
            historical Search Console data is retained, so there is nothing else
            to delete.
          </p>
          <p>
            授权账号可随时在{' '}
            <a
              href="https://myaccount.google.com/permissions"
              rel="noreferrer"
              target="_blank"
            >
              myaccount.google.com/permissions
            </a>{' '}
            撤销授权。撤销后已保存的 refresh token 立即失效，看板随即无法读取
            Search Console
            数据。本应用不保留任何历史数据，因此没有其他需要删除的内容。
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Questions about this policy can be raised in the project repository:{' '}
            <a href={websiteConfig.repository} rel="noreferrer" target="_blank">
              {websiteConfig.repository}
            </a>
          </p>
          <p>
            对本政策有疑问，可在项目仓库提出：
            <a href={websiteConfig.repository} rel="noreferrer" target="_blank">
              {websiteConfig.repository}
            </a>
          </p>
        </section>

        <p className="policy-back">
          <a href="/">返回看板 / Back to dashboard</a>
        </p>
      </article>
    </main>
  );
}
