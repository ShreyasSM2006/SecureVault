import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';

export function Spinner({ size = 18 }) {
  return <Loader2 className="spin" size={size} aria-label="Loading" />;
}

export function FullPageLoader({ label = 'Loading…' }) {
  return (
    <div className="center-screen"><Spinner size={32} /><p className="muted">{label}</p></div>
  );
}

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };

export function Alert({ type = 'info', children }) {
  if (!children) return null;
  const Icon = ICONS[type];
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <Icon size={18} /><div>{children}</div>
    </div>
  );
}

export function Button({ loading, children, variant = 'primary', icon: Icon, ...rest }) {
  return (
    <button className={`btn btn-${variant}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner size={16} /> : Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

export function Badge({ tone = 'neutral', icon: Icon, children }) {
  return <span className={`badge badge-${tone}`}>{Icon && <Icon size={13} />}{children}</span>;
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <Icon size={38} />}
      <h3>{title}</h3>
      <p className="muted">{children}</p>
    </div>
  );
}
