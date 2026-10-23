import type { ShareSource } from './share-content';
export type SharePrivacy = { aliases: boolean; contacts: boolean; hideTime: boolean; replacements: string };
export const DEFAULT_SHARE_PRIVACY: SharePrivacy = { aliases: true, contacts: false, hideTime: false, replacements: '' };
export function privateShareSource(source: ShareSource, privacy: SharePrivacy): ShareSource {
  const c = source.conversation;
  function redact(value: string) {
    let text = value;
    const replacements = privacy.replacements.split('\n').map(v => v.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
    for (const item of replacements) text = text.split(item).join('〔已隐藏〕');
    if (privacy.contacts) text = text.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '〔邮箱已隐藏〕')
      .replace(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, '〔电话已隐藏〕');
    if (privacy.aliases) {
      for (const [name, alias] of [[c.self, '我'], [c.other, '对方']].sort((a, b) => b[0].length - a[0].length))
        if (name && name.length >= 2 && name !== '对方' && name !== '__self_absent__') text = text.split(name).join(alias);
    }
    return text;
  }
  return { title: redact(source.title), conversation: { ...c, self: privacy.aliases ? '我' : c.self, other: privacy.aliases ? '对方' : c.other,
    messages: c.messages.map(m => ({ ...m, text: redact(m.text), timestamp: privacy.hideTime ? null : m.timestamp })),
    lines: Object.fromEntries(Object.entries(c.lines).map(([id, line]) => [id, { ...line,
      ...(line.strategyExplanation !== undefined ? { strategyExplanation: redact(line.strategyExplanation) } : {}),
      ...(line.subtext !== undefined ? { subtext: redact(line.subtext) } : {}), ...(line.skipped ? { skipped: redact(line.skipped) } : {}) }])),
    overview: c.overview ? { ...c.overview, alternative: c.overview.alternative ? redact(c.overview.alternative) : c.overview.alternative } : null,
  } };
}
