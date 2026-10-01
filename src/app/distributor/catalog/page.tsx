"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Search, Upload } from "lucide-react";
import { PageHead } from "@/components/cabinet/CabinetShell";
import { ProductArt } from "@/components/ProductArt";
import { Sheet } from "@/components/Sheet";
import type { ImportRow } from "@/lib/engine";
import { useAction, useApp } from "@/lib/data/provider";
import { pn, rub } from "@/lib/format";
import type { Product } from "@/lib/types";

const COLS: { key: keyof ImportRow; title: string; match: RegExp }[] = [
  { key: "sku", title: "Артикул", match: /артик|sku|код/i },
  { key: "name", title: "Наименование", match: /наимен|назв|товар|name/i },
  { key: "price", title: "Цена", match: /^цена$|цена канал|цена,|price/i },
  { key: "unit", title: "Единица", match: /ед/i },
  { key: "stock", title: "Остаток", match: /остат|склад|stock/i },
  { key: "category", title: "Категория", match: /катег/i },
  { key: "brand", title: "Бренд", match: /бренд|марка|brand/i },
  { key: "weight", title: "Фасовка", match: /фасов|вес/i },
  { key: "shelfPrice", title: "Цена на полке", match: /полк|розн/i },
];

// «Цену на полке» проверяем раньше «Цены», чтобы колонки не перепутались
const MATCH_ORDER = [...COLS.filter((c) => c.key === "shelfPrice"), ...COLS.filter((c) => c.key !== "shelfPrice")];

function toRows(table: unknown[][]): { rows: ImportRow[]; errors: string[] } {
  const [head, ...body] = table;
  const idx: Partial<Record<keyof ImportRow, number>> = {};
  (head ?? []).forEach((h, i) => {
    const t = String(h ?? "").trim();
    const col = MATCH_ORDER.find((c) => c.match.test(t) && idx[c.key] === undefined);
    if (col) idx[col.key] = i;
  });
  const errors: string[] = [];
  if (idx.sku === undefined || idx.price === undefined) errors.push("Нужны колонки «Артикул» и «Цена»");
  const num = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(String(v).replace(/\s/g, "").replace(",", ".")));
  const rows: ImportRow[] = [];
  body.forEach((r, n) => {
    if (!r || r.every((c) => c === null || c === "")) return;
    const get = (k: keyof ImportRow) => (idx[k] === undefined ? undefined : r[idx[k]!]);
    const sku = String(get("sku") ?? "").trim();
    const price = num(get("price"));
    if (!sku || !price || Number.isNaN(price)) {
      errors.push(`Строка ${n + 2}: нет артикула или цены`);
      return;
    }
    rows.push({
      sku,
      name: String(get("name") ?? sku),
      price,
      unit: get("unit") ? String(get("unit")) : undefined,
      stock: num(get("stock")),
      category: get("category") ? String(get("category")) : undefined,
      brand: get("brand") ? String(get("brand")) : undefined,
      weight: get("weight") ? String(get("weight")) : undefined,
      shelfPrice: num(get("shelfPrice")),
    });
  });
  return { rows, errors };
}

function parseCsv(text: string): string[][] {
  const sep = (text.split("\n")[0].match(/;/g) ?? []).length > 0 ? ";" : ",";
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim()));
}

export default function CatalogPage() {
  const { db, user } = useApp();
  const { run } = useAction();
  const [q, setQ] = useState("");
  const [importing, setImporting] = useState(false);
  const products = db.products.filter((p) => p.distributorId === user.distributorId);
  const list = products.filter((p) => `${p.name} ${p.sku} ${p.brand}`.toLowerCase().includes(q.toLowerCase()));

  const downloadTemplate = () => {
    const head = COLS.map((c) => c.title).join(";");
    const rows = products.map((p) => [p.sku, p.name, p.price, p.unit, p.stock, p.category, p.brand, p.weight, p.shelfPrice].join(";"));
    const blob = new Blob(["﻿" + [head, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "прайс-закупка.csv";
    a.click();
  };

  return (
    <>
      <PageHead
        title="Каталог и прайс"
        sub={`${pn(products.filter((p) => p.active).length, ["позиция", "позиции", "позиций"])} в продаже · цена канала видна покупателю заранее и не меняется в заказе`}
        actions={
          <>
            <button className="btn btn--sm" onClick={downloadTemplate}>
              <Download size={15} /> Выгрузить прайс
            </button>
            <button className="btn btn--sm btn--primary" onClick={() => setImporting(true)}>
              <Upload size={15} /> Загрузить Excel
            </button>
          </>
        }
      />

      <div className="search" style={{ maxWidth: 420, marginBottom: 14 }}>
        <Search size={18} />
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название, артикул, бренд" />
      </div>

      <div className="table-wrap">
        <table className="table table--cards table--flow">
          <thead>
            <tr>
              <th></th>
              <th>Товар</th>
              <th>Артикул</th>
              <th className="r">Цена канала</th>
              <th className="r">На полке</th>
              <th className="r">Остаток</th>
              <th>В продаже</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <Row key={p.id} p={p} onPatch={(patch) => run("updateProduct", p.id, patch)} />
            ))}
          </tbody>
        </table>
      </div>

      {importing && <ImportSheet onClose={() => setImporting(false)} />}
    </>
  );
}

function Row({ p, onPatch }: { p: Product; onPatch: (patch: Partial<Product>) => void }) {
  const num = (v: string) => Number(v.replace(",", "."));
  return (
    <tr style={{ opacity: p.active ? 1 : 0.5 }}>
      <td style={{ width: 52 }} className="no-cards">
        <ProductArt product={p} size={40} />
      </td>
      <td className="card-title">
        <b className="small">{p.name}</b>
        <div className="tiny muted">
          {p.brand} · {p.weight} · {p.category}
        </div>
      </td>
      <td className="mono small no-cards">{p.sku}</td>
      <td className="r" data-label="цена">
        <input
          className="input mono"
          style={{ width: 96, minHeight: 34, padding: "4px 8px", textAlign: "right" }}
          defaultValue={p.price}
          key={`p${p.price}`}
          onBlur={(e) => num(e.target.value) > 0 && num(e.target.value) !== p.price && onPatch({ price: num(e.target.value) })}
        />
      </td>
      <td className="r mono small muted nowrap no-cards">
        {rub(p.shelfPrice)}
        <div className="tiny" style={{ color: "var(--green)" }}>
          −{Math.round((1 - p.price / p.shelfPrice) * 100)}%
        </div>
      </td>
      <td className="r" data-label="остаток">
        <input
          className="input mono"
          style={{ width: 72, minHeight: 34, padding: "4px 8px", textAlign: "right", color: p.stock < 5 ? "var(--tomato)" : undefined }}
          defaultValue={p.stock}
          key={`s${p.stock}`}
          onBlur={(e) => num(e.target.value) >= 0 && num(e.target.value) !== p.stock && onPatch({ stock: Math.round(num(e.target.value)) })}
        />
      </td>
      <td data-label="в продаже">
        <label className="check">
          <input type="checkbox" checked={p.active} onChange={(e) => onPatch({ active: e.target.checked })} />
        </label>
      </td>
    </tr>
  );
}

function ImportSheet({ onClose }: { onClose: () => void }) {
  const { db, user, toast } = useApp();
  const { run, pending } = useAction();
  const [parsed, setParsed] = useState<{ rows: ImportRow[]; errors: string[]; file: string } | null>(null);
  const existing = new Set(db.products.filter((p) => p.distributorId === user.distributorId).map((p) => p.sku));

  const onFile = async (f: File) => {
    let table: unknown[][];
    if (/\.xlsx$/i.test(f.name)) {
      const { readSheet } = await import("read-excel-file/browser");
      table = (await readSheet(f)) as unknown[][];
    } else {
      table = parseCsv(await f.text());
    }
    setParsed({ ...toRows(table), file: f.name });
  };

  const added = parsed?.rows.filter((r) => !existing.has(r.sku)).length ?? 0;
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title="Загрузка прайса"
      footer={
        <button
          className="btn btn--primary btn--block"
          disabled={!parsed?.rows.length || !!pending}
          onClick={async () => {
            const res = await run("importPrice", user.distributorId!, parsed!.rows);
            if (res) toast({ title: `Прайс загружен`, body: `Обновлено ${res.updated}, добавлено ${res.added}.`, tone: "good" });
            onClose();
          }}
        >
          Применить {parsed ? pn(parsed.rows.length, ["строку", "строки", "строк"]) : ""}
        </button>
      }
    >
      <div className="stack">
        <label className="empty" style={{ cursor: "pointer" }}>
          <FileSpreadsheet size={28} />
          <b style={{ color: "var(--ink)" }}>{parsed ? parsed.file : "Выберите файл .xlsx или .csv"}</b>
          <span className="small">Колонки: Артикул, Наименование, Цена, Единица, Остаток, Категория, Бренд, Фасовка, Цена на полке</span>
          <input
            type="file"
            accept=".xlsx,.csv"
            hidden
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0]).catch(() => toast({ title: "Не удалось прочитать файл", tone: "error" }))}
          />
        </label>
        <span className="tiny muted">Совпадение по артикулу обновляет цену и остаток, новые артикулы добавляются в каталог. Подсказка: выгрузите текущий прайс, поправьте цены и загрузите обратно.</span>
        {parsed && (
          <>
            <div className="row wrap">
              <span className="chip chip--blue">обновится {parsed.rows.length - added}</span>
              <span className="chip chip--green">новых {added}</span>
              {parsed.errors.length > 0 && <span className="chip chip--tomato">ошибок {parsed.errors.length}</span>}
            </div>
            {parsed.errors.slice(0, 5).map((e) => (
              <div key={e} className="tiny" style={{ color: "var(--tomato)" }}>
                {e}
              </div>
            ))}
            <div className="table-wrap" style={{ maxHeight: 280, overflowY: "auto" }}>
              <table className="table">
                <tbody>
                  {parsed.rows.slice(0, 50).map((r) => (
                    <tr key={r.sku}>
                      <td className="mono small">{r.sku}</td>
                      <td className="small">{r.name}</td>
                      <td className="r mono small">{rub(r.price)}</td>
                      <td>{existing.has(r.sku) ? <span className="chip chip--blue">обн.</span> : <span className="chip chip--green">нов.</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
