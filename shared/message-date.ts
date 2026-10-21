export function messageDate(timestamp: string | null | undefined) {
  const match = timestamp?.match(/(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : undefined;
}
