const elements = {
  baseStatus: document.getElementById('baseStatus'),
  nameSearchInput: document.getElementById('nameSearchInput'),
  lookupStatus: document.getElementById('lookupStatus'),
  clearSearchBtn: document.getElementById('clearSearchBtn'),
  emptyState: document.getElementById('emptyState'),
  resultsList: document.getElementById('resultsList')
};

const minSearchLength = 2;
const maxResults = 30;

let usersData = [];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function setBaseStatus(text, variant = 'default') {
  elements.baseStatus.textContent = text;
  elements.baseStatus.dataset.variant = variant;
}

function setLookupStatus(text) {
  elements.lookupStatus.textContent = text;
}

function renderEmptyState(text) {
  elements.emptyState.textContent = text;
  elements.emptyState.classList.remove('hidden');
  elements.resultsList.classList.add('hidden');
  elements.resultsList.innerHTML = '';
}

function buildResultMeta(user) {
  const filial = user.filial ? `Filial ${user.filial}` : 'Filial -';
  const regional = user.regional || 'Regional -';
  const cargo = user.cargo || 'Cargo -';
  return `${filial} • ${regional} • ${cargo}`;
}

async function copyIdMagalu(idMagalu, button) {
  try {
    await navigator.clipboard.writeText(String(idMagalu || ''));
    const originalText = button.textContent;
    button.textContent = 'Copiado';
    window.setTimeout(() => {
      button.textContent = originalText;
    }, 1200);
  } catch {
    button.textContent = 'Falhou';
    window.setTimeout(() => {
      button.textContent = 'Copiar ID';
    }, 1200);
  }
}

function renderResults(results, query) {
  if (results.length === 0) {
    renderEmptyState(`Nenhuma pessoa encontrada para "${query}".`);
    setLookupStatus('Nenhum resultado encontrado.');
    return;
  }

  elements.emptyState.classList.add('hidden');
  elements.resultsList.classList.remove('hidden');
  setLookupStatus(`${results.length} resultado(s) exibido(s).`);

  elements.resultsList.innerHTML = results.map((user, index) => `
    <article class="result-item">
      <div>
        <div class="result-name">${user.nome}</div>
        <div class="result-meta">${buildResultMeta(user)}</div>
      </div>
      <div class="result-id-row">
        <div>
          <span class="result-id-label">ID Magalu</span>
          <strong class="result-id-value">${user.id_magalu || '-'}</strong>
        </div>
        <button type="button" class="copy-id-btn" data-copy-index="${index}">Copiar ID</button>
      </div>
    </article>
  `).join('');

  const buttons = elements.resultsList.querySelectorAll('[data-copy-index]');
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const resultIndex = Number(button.dataset.copyIndex);
      const selectedUser = results[resultIndex];
      void copyIdMagalu(selectedUser.id_magalu, button);
    });
  });
}

function findMatches(query) {
  const normalizedQuery = normalizeText(query);

  return usersData
    .map(user => ({
      user,
      normalizedName: normalizeText(user.nome)
    }))
    .filter(item => item.normalizedName.includes(normalizedQuery))
    .sort((left, right) => {
      const leftStarts = left.normalizedName.startsWith(normalizedQuery) ? 0 : 1;
      const rightStarts = right.normalizedName.startsWith(normalizedQuery) ? 0 : 1;

      if (leftStarts !== rightStarts) {
        return leftStarts - rightStarts;
      }

      return left.normalizedName.localeCompare(right.normalizedName, 'pt-BR');
    })
    .slice(0, maxResults)
    .map(item => item.user);
}

function handleSearchInput() {
  const query = elements.nameSearchInput.value.trim();
  elements.clearSearchBtn.disabled = query.length === 0;

  if (!query) {
    setLookupStatus('Base pronta para consulta.');
    renderEmptyState('Digite pelo menos 2 letras para iniciar a busca.');
    return;
  }

  if (query.length < minSearchLength) {
    setLookupStatus('Continue digitando para refinar a busca.');
    renderEmptyState('Digite pelo menos 2 letras para buscar pelo nome.');
    return;
  }

  const results = findMatches(query);
  renderResults(results, query);
}

async function loadUsersData() {
  setBaseStatus('Carregando base');

  try {
    const response = await fetch('Users.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Falha HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Formato invalido para Users.json');
    }

    usersData = data;
    setBaseStatus(`Base pronta: ${usersData.length} registros`, 'ready');
    setLookupStatus('Base pronta para consulta.');
    renderEmptyState('Digite pelo menos 2 letras para iniciar a busca.');
  } catch {
    usersData = [];
    setBaseStatus('Base indisponivel', 'error');
    setLookupStatus('Nao foi possivel carregar a base de usuarios.');
    renderEmptyState('Abra esta pagina pelo servidor local para consultar os nomes.');
    elements.nameSearchInput.disabled = true;
    elements.clearSearchBtn.disabled = true;
  }
}

elements.nameSearchInput.addEventListener('input', handleSearchInput);

elements.clearSearchBtn.addEventListener('click', () => {
  elements.nameSearchInput.value = '';
  elements.nameSearchInput.focus();
  handleSearchInput();
});

void loadUsersData();