import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { servicesAPI } from '../../services/api';

function money(v) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

export default function ServiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await servicesAPI.get(id);
        setService(res.data);
      } catch (err) {
        setError(err?.response?.data?.error || 'Erro ao carregar serviço.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!service) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Detalhe do Serviço</div>
          <div className="page-subtitle">Visão completa para atendimento e gestão</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/servicos')}>Voltar</button>
          <Link to={`/servicos/${service.id}/editar`} className="btn btn-primary">Editar serviço</Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Dados do serviço</div>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <div className="text-sm text-muted">Nome</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{service.name}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div>
              <div className="text-sm text-muted">Categoria</div>
              <div style={{ fontWeight: 600 }}>
                <span className="badge badge-gray">{service.category || 'Sem categoria'}</span>
              </div>
            </div>
            <div>
              <div className="text-sm text-muted">Preço</div>
              <div style={{ fontWeight: 700, fontSize: 20, color: '#1A3C5E' }}>{money(service.price)}</div>
            </div>
            {service.executionCount != null && (
              <div>
                <div className="text-sm text-muted">Execuções</div>
                <div style={{ fontWeight: 600 }}>{service.executionCount}</div>
              </div>
            )}
          </div>

          {service.description && (
            <div>
              <div className="text-sm text-muted">Descrição</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{service.description}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
