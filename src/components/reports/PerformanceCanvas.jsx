import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import MetricCard from './MetricCard';
import MetricPicker from './MetricPicker';
import ReportWidget from './ReportWidget';
import AddWidgetPicker from './AddWidgetPicker';
import { computeMetrics, dailySeries, applyFilters, METRIC_CATALOG, leadField, formatMetric } from '@/lib/reportMetrics';
import { reorder } from '@/lib/reorder';

let idc = 0;
const nid = () => `w${Date.now()}_${idc++}`;

// The editable Performance Overview canvas: metric cards grid + widgets.
export default function PerformanceCanvas({
  leads, adSpend, cards, widgets, onCardsChange, onWidgetsChange, customFields, filters,
}) {
  const [pickCard, setPickCard] = useState(false);
  const [pickWidget, setPickWidget] = useState(false);

  const filtered = applyFilters(leads, filters);
  const metrics = computeMetrics(filtered, adSpend);
  const series = dailySeries(filtered, adSpend, 14);
  const revSeries = series.map(s => s.revenue);

  const cardValue = (card) => {
    if (card.metric?.startsWith('field:')) {
      const f = card.metric.slice(6);
      const vals = filtered.map(l => Number(leadField(l, f))).filter(v => !isNaN(v));
      return vals.reduce((a, b) => a + b, 0);
    }
    return metrics[card.metric] ?? 0;
  };
  const cardSeries = (card) => {
    if (['revenue', 'net_revenue', 'booked_revenue'].includes(card.metric)) return revSeries;
    if (['cost', 'ad_spend', 'cpl', 'blended_cpl'].includes(card.metric)) return series.map(s => s.cost + s.spend);
    if (['profit', 'net_profit'].includes(card.metric)) return series.map(s => s.profit);
    return series.map(s => s.leads);
  };

  const onDragCard = (r) => {
    if (!r.destination) return;
    onCardsChange(reorder(cards, r.source.index, r.destination.index));
  };
  const addCard = (opt) => {
    const metric = opt.kind === 'field' ? `field:${opt.key.replace('field:', '')}` : opt.key;
    onCardsChange([...cards, { id: nid(), metric, label: opt.label }]);
  };
  const removeCard = (id) => onCardsChange(cards.filter(c => c.id !== id));

  const addWidget = (type) => onWidgetsChange([...widgets, { id: nid(), type }]);
  const updateWidget = (id, next) => onWidgetsChange(widgets.map(w => w.id === id ? next : w));
  const removeWidget = (id) => onWidgetsChange(widgets.filter(w => w.id !== id));
  const dupWidget = (id) => {
    const w = widgets.find(x => x.id === id);
    const idx = widgets.findIndex(x => x.id === id);
    const copy = { ...w, id: nid() };
    onWidgetsChange([...widgets.slice(0, idx + 1), copy, ...widgets.slice(idx + 1)]);
  };
  const moveWidget = (id, dir) => {
    const idx = widgets.findIndex(x => x.id === id);
    const to = idx + dir;
    if (to < 0 || to >= widgets.length) return;
    onWidgetsChange(reorder(widgets, idx, to));
  };

  return (
    <div>
      {/* METRIC CARDS */}
      <DragDropContext onDragEnd={onDragCard}>
        <Droppable droppableId="cards" direction="horizontal">
          {(prov) => (
            <div ref={prov.innerRef} {...prov.droppableProps}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 mb-6">
              {cards.map((card, i) => (
                <Draggable key={card.id} draggableId={card.id} index={i}>
                  {(p) => (
                    <div ref={p.innerRef} {...p.draggableProps}>
                      <MetricCard
                        card={card}
                        value={cardValue(card)}
                        series={cardSeries(card)}
                        positive={['returns', 'fakes', 'dqs', 'duplicates', 'revenue_gap', 'overdue', 'short_paid', 'outstanding'].includes(card.metric) ? false : true}
                        onRemove={() => removeCard(card.id)}
                        dragHandleProps={p.dragHandleProps}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {prov.placeholder}
              <button onClick={() => setPickCard(true)}
                className="border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1 min-h-[104px] text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors">
                <Plus className="w-5 h-5" /><span className="text-[12px]">Add Card</span>
              </button>
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* WIDGETS */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {widgets.map(w => (
          <ReportWidget
            key={w.id}
            widget={{
              ...w,
              onDuplicate: () => dupWidget(w.id),
              onRemove: () => removeWidget(w.id),
              onMoveLeft: () => moveWidget(w.id, -1),
              onMoveRight: () => moveWidget(w.id, 1),
            }}
            leads={filtered}
            adSpend={adSpend}
            onChange={(next) => updateWidget(w.id, next)}
          />
        ))}
        <button onClick={() => setPickWidget(true)}
          className="border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1 min-h-[160px] text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors">
          <Plus className="w-6 h-6" /><span className="text-[13px]">Add Widget</span>
        </button>
      </div>

      <MetricPicker open={pickCard} onOpenChange={setPickCard} onPick={addCard} customFields={customFields} />
      <AddWidgetPicker open={pickWidget} onOpenChange={setPickWidget} onPick={addWidget} />
    </div>
  );
}

export const makeDefaultCards = () =>
  METRIC_CATALOG.filter(m => m.key !== 'phone_verified').map((m, i) => ({ id: `c${i}`, metric: m.key, label: m.label }));

export const makeDefaultWidgets = () => [
  { id: 'dw1', type: 'rev_spend_profit', wide: true },
  { id: 'dw2', type: 'status_donut' },
  { id: 'dw3', type: 'campaigns' },
  { id: 'dw4', type: 'states' },
  { id: 'dw5', type: 'buyers' },
  { id: 'dw6', type: 'suppliers' },
  { id: 'dw7', type: 'daily_metrics', wide: true },
  { id: 'dw8', type: 'utm_source' },
  { id: 'dw9', type: 'buyer_feedback' },
  { id: 'dw10', type: 'injury_type' },
  { id: 'dw11', type: 'accident_date' },
  { id: 'dw12', type: 'treatment_time' },
  { id: 'dw13', type: 'phone_verification' },
];