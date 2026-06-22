export default function RevenueChart({ data, currency }: { data: Array<{ label: string; value: number }>; currency: string }) {
  const width = 760;
  const height = 220;
  const max = Math.max(...data.map((item) => item.value), 1);
  const points = data.map((item, index) => {
    const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
    const y = height - (item.value / max) * (height - 24) - 8;
    return { ...item, x, y };
  });
  const polyline = points.map(({ x, y }) => `${x},${y}`).join(" ");
  return (
    <div>
      <div className="h-[250px] w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height + 20}`} className="h-full w-full" role="img" aria-label="Revenue over time">
          <defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#111827" stopOpacity=".18"/><stop offset="100%" stopColor="#111827" stopOpacity="0"/></linearGradient></defs>
          {[0, .25, .5, .75, 1].map((ratio) => <line key={ratio} x1="0" x2={width} y1={8 + ratio * (height - 24)} y2={8 + ratio * (height - 24)} stroke="#111827" strokeOpacity=".08" />)}
          {points.length > 1 ? <path d={`M ${points[0].x} ${height} L ${polyline.replaceAll(",", " ")} L ${points.at(-1)?.x} ${height} Z`} fill="url(#revenueFill)" /> : null}
          <polyline points={polyline} fill="none" stroke="#111827" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point) => <circle key={`${point.label}-${point.x}`} cx={point.x} cy={point.y} r="4" fill="white" stroke="#111827" strokeWidth="3"><title>{point.label}: {currency} {(point.value / 100).toFixed(2)}</title></circle>)}
        </svg>
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-medium text-black/35">{points.filter((_, index) => index % Math.ceil(points.length / 6) === 0 || index === points.length - 1).map((point) => <span key={point.label}>{point.label}</span>)}</div>
    </div>
  );
}
