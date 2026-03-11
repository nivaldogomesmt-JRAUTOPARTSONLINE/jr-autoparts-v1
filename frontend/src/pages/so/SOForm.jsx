import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clientsAPI, productsAPI, servicesAPI, soAPI, vehiclesAPI } from '../../services/api';

export default function SOForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({ clientId: '', vehicleId: '', entryKm: '', notes: '' });
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clientSearch, setClientSearch] = useState('');

  const [productSearch, setProductSearch] = useState('');
  const [productFocused, setProductFocused] = useState(false);
  const [activeProductIndex, setActiveProductIndex] = useState(-1);
  const productSearchRef = useRef(null);

  useEffect(() => {
    Promise.all([
      clientsAPI.list({ page: 1, limit: 5000 }),
      productsAPI.list({ page: 1, limit: 40 }),
      servicesAPI.list(),
    ]).then(([c, p, s]) => {
      setClients(c.data.data || []);
      setProducts(p.data.data || []);
      setServices(s.data || []);
    });

    if (!isEdit) return;

    soAPI.get(id).then((res) => {
      const os = res.data;
      setForm({
        clientId: os.clientId,
        vehicleId: os.vehicleId,
        entryKm: os.entryKm || '',
        notes: os.notes || '',
      });
      setItems(
        (os.items || []).map((i) => ({
          type: i.type,
          itemId: i.productId || i.serviceId,
          itemName: i.itemName,
          quantity: parseFloat(i.quantity),
          unitPrice: parseFloat(i.unitPrice),
        }))
      );
    });
  }, [id, isEdit]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const params = { page: 1, limit: 40 };
        if (productSearch.trim()) params.search = productSearch.trim();
        const res = await productsAPI.list(params);
        setProducts(res.data.data || []);
        setActiveProductIndex(-1);
      } catch {
        // keep input responsive
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [productSearch]);

  useEffect(() => {
    if (!form.clientId) {
      setVehicles([]);
      return;
    }
    vehiclesAPI.list({ clientId: form.clientId }).then((res) => setVehicles(res.data.data || []));
  }, [form.clientId]);

  const addItem = (type, item) => {
    if (!item) return;
    setItems((prev) => [
      ...prev,
      {
        type,
        itemId: item.id,
        itemName: item.name,
        quantity: 1,
        unitPrice: parseFloat(item.price),
      },
    ]);
  };

  const selectProduct = (product) => {
    addItem('PRODUCT', product);
    setProductSearch('');
    setActiveProductIndex(-1);
    setProductFocused(false);
    productSearchRef.current?.focus();
  };

  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const updateItem = (idx, field, value) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const total = items.reduce((sum, i) => sum + parseFloat(i.unitPrice) * parseFloat(i.quantity), 0);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.name, c.cpfCnpj, c.phone, c.whatsapp, c.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [clients, clientSearch]);

  const productSuggestions = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 12);
    return products.slice(0, 12);
  }, [products, productSearch]);

  const showSuggestions = productFocused && productSuggestions.length > 0;

  const onProductKeyDown = (e) => {
    if (!showSuggestions && e.key !== 'Enter') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveProductIndex((prev) => {
        const next = prev + 1;
        return next >= productSuggestions.length ? 0 : next;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveProductIndex((prev) => {
        const next = prev - 1;
        return next < 0 ? productSuggestions.length - 1 : next;
      });
      return;
    }

    if (e.key === 'Enter') {
      if (activeProductIndex >= 0 && productSuggestions[activeProductIndex]) {
        e.preventDefault();
        selectProduct(productSuggestions[activeProductIndex]);
        return;
      }

      if (productSuggestions.length > 0) {
        e.preventDefault();
        selectProduct(productSuggestions[0]);
        return;
      }

      const term = productSearch.trim();
      if (!term) return;

      e.preventDefault();
      productsAPI
        .list({ page: 1, limit: 8, search: term })
        .then((res) => {
          const found = res.data?.data || [];
          const exactByBarcode = found.find(
            (p) => String(p.barcode || '').trim().toUpperCase() === term.toUpperCase()
          );
          if (exactByBarcode) {
            selectProduct(exactByBarcode);
            return;
          }
          if (found[0]) {
            selectProduct(found[0]);
          }
        })
        .catch(() => {
          // keep typing flow smooth
        });
    }

    if (e.key === 'Escape') {
      setProductFocused(false);
      setActiveProductIndex(-1);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.clientId || !form.vehicleId) return setError('Selecione cliente e veiculo.');
    if (form.entryKm === '' || form.entryKm === null || form.entryKm === undefined) {
      return setError('Informe a quilometragem de entrada.');
    }

    setLoading(true);
    setError('');

    try {
      if (isEdit) {
        await soAPI.update(id, { ...form, items });
        navigate(`/os/${id}`);
      } else {
        const res = await soAPI.create({ ...form, items });
        navigate(`/os/${res.data.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar OS.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{isEdit ? 'Editar OS' : 'Nova Ordem de Servico'}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>Voltar</button>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Dados do Cliente</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Buscar cliente</label>
              <input
                className="form-control"
                placeholder="Digite nome, CPF/CNPJ, telefone ou email..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <label className="form-label required">Cliente</label>
              <select
                className="form-control"
                value={form.clientId}
                onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value, vehicleId: '' }))}
                required
              >
                <option value="">Selecione o cliente...</option>
                {filteredClients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label required">Veiculo</label>
              <select
                className="form-control"
                value={form.vehicleId}
                onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}
                required
                disabled={!form.clientId}
              >
                <option value="">Selecione o veiculo...</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.plate} - {v.brand} {v.model}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label required">KM de Entrada</label>
              <input
                type="number"
                className="form-control"
                placeholder="Ex: 85000"
                value={form.entryKm}
                onChange={(e) => setForm((f) => ({ ...f, entryKm: e.target.value }))}
                min={0}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Observacoes</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Descreva o problema relatado pelo cliente..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Servicos e Pecas</div>

          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Adicionar Servico</label>
            <select
              className="form-control"
              onChange={(e) => {
                const s = services.find((x) => x.id === e.target.value);
                if (s) addItem('SERVICE', s);
                e.target.value = '';
              }}
            >
              <option value="">Selecione um servico...</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name} - R$ {parseFloat(s.price).toFixed(2)}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16, position: 'relative' }}>
            <label className="form-label">Adicionar Peca / Produto</label>
            <input
              ref={productSearchRef}
              className="form-control"
              placeholder="Buscar por nome ou codigo de barras (setas + Enter)"
              value={productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value);
                setProductFocused(true);
              }}
              onFocus={() => setProductFocused(true)}
              onBlur={() => setTimeout(() => setProductFocused(false), 140)}
              onKeyDown={onProductKeyDown}
              autoComplete="off"
            />
            {showSuggestions ? (
              <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, marginTop: 6, maxHeight: 260, overflowY: 'auto', boxShadow: '0 8px 22px rgba(15, 23, 42, .12)' }}>
                {productSuggestions.map((p, idx) => {
                  const active = idx === activeProductIndex;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectProduct(p)}
                      style={{ width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: active ? '#eff6ff' : '#fff', cursor: 'pointer' }}
                    >
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</div>
                      <div className="text-sm text-muted">Cod barras: {p.barcode || 'Nao informado'} | R$ {parseFloat(p.price || 0).toFixed(2)}</div>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="text-sm text-muted" style={{ marginTop: 6 }}>
              {products.length} produto(s) carregado(s) para selecao rapida.
            </div>
          </div>

          {items.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Item</th>
                    <th>Qtd</th>
                    <th>Preco Unit.</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className={`badge ${item.type === 'SERVICE' ? 'badge-blue' : 'badge-gray'}`}>
                          {item.type === 'SERVICE' ? 'Servico' : 'Peca'}
                        </span>
                      </td>
                      <td>{item.itemName}</td>
                      <td>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          className="form-control"
                          style={{ width: 70 }}
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="form-control"
                          style={{ width: 100 }}
                          value={item.unitPrice}
                          onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                        />
                      </td>
                      <td>
                        <strong>R$ {(parseFloat(item.quantity) * parseFloat(item.unitPrice)).toFixed(2).replace('.', ',')}</strong>
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeItem(idx)}>x</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>TOTAL</td>
                    <td style={{ fontWeight: 700, fontSize: 16, color: '#1A3C5E' }}>R$ {total.toFixed(2).replace('.', ',')}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Salvando...' : isEdit ? 'Salvar Alteracoes' : 'Criar OS'}
          </button>
        </div>
      </form>
    </div>
  );
}


