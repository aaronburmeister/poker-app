interface Settings {
  showOdds: boolean;
}

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
}

export type { Settings };

export function SettingsModal({ settings, onChange }: Props) {
  return (
    <div className="settings-overlay" onClick={e => e.currentTarget === e.target && onChange(settings)}>
      <div className="settings-modal">
        <div className="settings-header">
          <span className="settings-title">Settings</span>
        </div>
        <div className="settings-body">
          <label className="settings-row">
            <div className="settings-label">
              <span className="settings-label-name">Odds Assistant</span>
              <span className="settings-label-desc">
                Shows pot odds, outs, and equity estimates to help you learn when to call, raise, or fold.
              </span>
            </div>
            <input
              type="checkbox"
              className="settings-toggle"
              checked={settings.showOdds}
              onChange={e => onChange({ ...settings, showOdds: e.target.checked })}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
