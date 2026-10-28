import {
  IconChartLine,
  IconExternalLink,
  IconLayoutDashboard,
  IconLock,
  IconRefresh,
} from '@tabler/icons-react';
import {
  permissionLabels,
  propertyName,
  propertyWebsite,
} from '@/features/gsc/property';
import type { SearchProperty } from '@/features/gsc/types';

/** One shared lockup keeps the access screen and app shell visually consistent. */
export function DashboardBrand() {
  return (
    <div className="brand-lockup">
      <span className="brand-glyph">
        <IconChartLine size={19} stroke={2.6} />
      </span>
      <span>
        Sail
        <br />
        <strong>Desk</strong>
      </span>
    </div>
  );
}

/** Both overview and details use this single responsive project navigation. */
export function DashboardSidebar({
  properties,
  selected,
  onSelect,
  onLock,
}: {
  properties: SearchProperty[];
  selected: string;
  onSelect: (view: string) => void;
  onLock: () => void;
}) {
  return (
    <aside className="project-sidebar" aria-label="GSC 项目">
      <DashboardBrand />
      <nav className="dashboard-nav" aria-label="看板导航">
        <button
          type="button"
          className={`project-item overview-nav ${selected === 'overview' ? 'is-active' : ''}`}
          aria-current={selected === 'overview' ? 'page' : undefined}
          onClick={() => onSelect('overview')}
        >
          <IconLayoutDashboard size={18} />
          <span>全部站点总览</span>
          <span className="nav-count">{properties.length}</span>
        </button>
      </nav>
      <div className="sidebar-label">
        <span>单站详情</span>
        <span>{properties.length}</span>
      </div>
      <nav className="project-list" aria-label="选择项目">
        {properties.map((property) => (
          <button
            key={property.siteUrl}
            type="button"
            className={`project-item ${selected === property.siteUrl ? 'is-active' : ''}`}
            aria-current={selected === property.siteUrl ? 'page' : undefined}
            title={property.siteUrl}
            onClick={() => onSelect(property.siteUrl)}
          >
            <span className="project-favicon">
              {propertyName(property.siteUrl).slice(0, 1).toUpperCase()}
            </span>
            <span className="project-name">
              {propertyName(property.siteUrl)}
            </span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        {selected !== 'overview' && (
          <a
            href={propertyWebsite(selected)}
            target="_blank"
            rel="noreferrer"
            className="sidebar-link"
          >
            <IconExternalLink size={16} />
            打开网站
          </a>
        )}
        <button type="button" className="sidebar-link" onClick={onLock}>
          <IconLock size={16} />
          锁定看板
        </button>
      </div>
    </aside>
  );
}

/** Refresh and headings follow the currently visible resource, including errors. */
export function DashboardHeader({
  selected,
  property,
  count,
  loading,
  onRefresh,
}: {
  selected: string;
  property?: SearchProperty;
  count: number;
  loading: boolean;
  onRefresh: () => void;
}) {
  const overview = selected === 'overview';
  return (
    <header className="workspace-header">
      <div>
        <p className="eyebrow">
          {overview ? 'PORTFOLIO OVERVIEW' : 'GOOGLE SEARCH CONSOLE'}
        </p>
        <div className="project-heading">
          <h1>{overview ? '全部站点总览' : propertyName(selected)}</h1>
          <span className="permission-badge">
            {overview
              ? `${count} 个资源`
              : permissionLabels[property?.permissionLevel ?? '']}
          </span>
        </div>
        <p className="workspace-description">
          {overview
            ? '哪些站在增长，哪些站需要关注。'
            : '查看当前站点的搜索表现与流量来源。'}
        </p>
      </div>
      <button
        type="button"
        className="refresh-button"
        aria-label="刷新数据"
        onClick={onRefresh}
        disabled={loading}
      >
        <IconRefresh size={17} className={loading ? 'spin' : ''} />
        刷新数据
      </button>
    </header>
  );
}
