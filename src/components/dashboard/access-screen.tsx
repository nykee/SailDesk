import { IconLock, IconSparkles } from '@tabler/icons-react';
import { type FormEvent, useState } from 'react';
import { DashboardBrand } from './dashboard-chrome';
/** Password entry stays separate from upstream data errors and report loading. */
export function AccessScreen({
  message,
  onUnlock,
}: {
  message: string | null;
  onUnlock: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(message);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onUnlock(password);
    } catch (unlockError) {
      setError(
        unlockError instanceof Error ? unlockError.message : '无法解锁看板。'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="connection-screen">
      <div className="connection-grid" />
      <section className="connection-panel">
        <DashboardBrand />
        <p className="eyebrow">YOUR SITES, ONE VIEW</p>
        <h1>
          把所有站点数据
          <br />
          放在同一个工作台。
        </h1>
        <p>
          本看板使用已授权 Google 账号的安全 refresh token，自动读取该账号下所有
          Property，并把 Search Console、GA4、Bing Webmaster 与 Umami
          的数据放在同一处分析。
        </p>
        {error && (
          <div className="notice connection-notice" role="alert">
            {error}
          </div>
        )}
        <form className="access-form" onSubmit={submit}>
          <label htmlFor="dashboard-password">看板访问密码</label>
          <input
            id="dashboard-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button
            className="connect-button"
            type="submit"
            disabled={isSubmitting}
          >
            <IconLock size={16} />
            {isSubmitting ? '正在验证…' : '进入数据看板'}
          </button>
        </form>
        <p className="connection-note">
          <IconSparkles size={15} />
          Google refresh token 仅存于 Cloudflare Secret，不会发送给浏览器。
        </p>
        <p className="connection-policy">
          <a href="/privacy">隐私政策 / Privacy Policy</a>
        </p>
      </section>
    </main>
  );
}
