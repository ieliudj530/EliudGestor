// ======================================================
// MAIN.JS - GESTIÓN ERP v8.3 (FIX XML RECETAS)
// ======================================================

console.log("SISTEMA CARGADO: v8.3");

const Store = {
    raw: JSON.parse(localStorage.getItem('erp_raw')) || [],
    finished: JSON.parse(localStorage.getItem('erp_finished')) || [],
    recipes: JSON.parse(localStorage.getItem('erp_recipes')) || [],
    tempEntry: [],
    
    save: function() {
        localStorage.setItem('erp_raw', JSON.stringify(this.raw));
        localStorage.setItem('erp_finished', JSON.stringify(this.finished));
        localStorage.setItem('erp_recipes', JSON.stringify(this.recipes));
        Dashboard.render();
    }
};

const Toast = {
    show: function(msg, type='info') {
        const c = document.getElementById('toast-area');
        const color = type==='success'?'bg-success':type==='error'?'bg-danger':'bg-primary';
        const el = document.createElement('div');
        el.className = `toast show align-items-center text-white border-0 mb-2 shadow-lg ${color}`;
        el.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
        c.appendChild(el); setTimeout(()=>el.remove(), 4000);
    }
};

// LOGIN & NAV
document.getElementById('login-form')?.addEventListener('submit', function(e) {
    e.preventDefault();
    if(document.getElementById('u-name').value === 'admin'){
        document.getElementById('login-screen').style.display='none';
        document.getElementById('app-content').style.filter='none';
        Dashboard.render();
    }
});
function logout() { if(confirm('Sair?')) location.reload(); }

function loadView(id) {
    document.querySelectorAll('.view-section').forEach(el=>el.style.display='none');
    document.getElementById(`view-${id}`).style.display='block';
    document.getElementById('sidebar').classList.remove('show');
    document.getElementById('sidebar-overlay').classList.remove('show');
    
    if(id==='estoque') Stock.render();
    if(id==='acabado') Finished.render();
    if(id==='saida') Dispatch.render();
    if(id==='fichas') Recipes.render();
    if(id==='producao') { Production.loadRecipes(); Production.refreshBatches(); }
}
function toggleSidebar() { 
    document.getElementById('sidebar').classList.toggle('show');
    document.getElementById('sidebar-overlay').classList.toggle('show');
}

// --- ENTRADA (CHECK-IN) ---
const Entry = {
    addTemp: function(i) { Store.tempEntry.push(i); this.renderTemp(); },
    renderTemp: function() {
        const tb = document.getElementById('temp-entry-body');
        if(!Store.tempEntry.length) return tb.innerHTML='<tr><td colspan="6" class="text-center py-5 text-muted">Aguardando XML...</td></tr>';
        tb.innerHTML = Store.tempEntry.map((i,x) => {
            const icon = i.verified 
                ? `<button class="btn btn-success btn-sm rounded-circle" onclick="Entry.toggleStatus(${x})"><i class="fas fa-check"></i></button>`
                : `<button class="btn btn-outline-danger btn-sm rounded-circle" onclick="Entry.toggleStatus(${x})"><i class="fas fa-times"></i></button>`;
            const rowClass = i.verified ? 'table-success' : '';
            return `<tr class="${rowClass}"><td class="text-center">${icon}</td><td><div class="fw-bold text-dark">${i.desc}</div><small class="text-muted"><i class="fas fa-barcode"></i> ${i.code || 'S/N'}</small></td><td class="text-center fw-bold">${i.qty}</td><td class="text-center">${i.totalWeight}</td><td class="text-center">${i.unitWeight.toFixed(4)}</td><td class="text-end"><button class="btn btn-sm btn-link text-danger" onclick="Entry.remove(${x})"><i class="fas fa-trash"></i></button></td></tr>`;
        }).join('');
    },
    remove: function(x) { Store.tempEntry.splice(x,1); this.renderTemp(); },
    toggleStatus: function(index) { Store.tempEntry[index].verified = !Store.tempEntry[index].verified; this.renderTemp(); },
    verifyByCode: function(scannedCode) {
        const index = Store.tempEntry.findIndex(i => (i.code && i.code.toString() === scannedCode.toString()) || i.desc.includes(scannedCode));
        if (index !== -1) { Store.tempEntry[index].verified = true; this.renderTemp(); return true; }
        return false;
    }
};

function processXML(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(e.target.result, "text/xml");
        const items = xmlDoc.getElementsByTagName("det");
        for (let i = 0; i < items.length; i++) {
            const prod = items[i].getElementsByTagName("prod")[0];
            const desc = prod.getElementsByTagName("xProd")[0].textContent;
            const code = prod.getElementsByTagName("cEAN")[0]?.textContent || prod.getElementsByTagName("cProd")[0].textContent || "S/COD";
            const qty = parseFloat(prod.getElementsByTagName("qCom")[0].textContent);
            const unit = prod.getElementsByTagName("uCom")[0].textContent; 
            let totalWeight = (unit.toUpperCase()==='KG') ? qty : (parseFloat(prod.getElementsByTagName("qTrib")[0]?.textContent)||0);
            let unitWeight = (qty>0 && totalWeight>0) ? totalWeight/qty : 0;
            let type = (desc.toUpperCase().includes('FIO')||desc.toUpperCase().includes('COLA'))?'COMUM':'KIT';
            Entry.addTemp({ id: Date.now()+i, code: code, desc, qty, totalWeight, unitWeight, type, verified: false });
        }
        Toast.show('XML Importado! Inicie a conferência.', 'success');
        input.value='';
    };
    reader.readAsText(file);
}

function startConferenceScanner() {
    const m = new bootstrap.Modal(document.getElementById('scannerModal')); m.show();
    setTimeout(() => {
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (txt) => {
            const found = Entry.verifyByCode(txt);
            if(found) Toast.show(`ITEM CONFIRMADO!`, 'success'); else Toast.show(`Item não encontrado!`, 'error');
        });
    }, 300);
    document.getElementById('scannerModal').addEventListener('hidden.bs.modal', ()=>{ if(html5QrCode && html5QrCode.isScanning) html5QrCode.stop(); });
}

function commitEntry() {
    const batchInput = document.getElementById('in-batch');
    const batchName = batchInput.value.toUpperCase().trim();
    if(!batchName || !Store.tempEntry.length) return Toast.show('Erro: Falta Lote ou Itens', 'error');
    if(Store.tempEntry.filter(i => !i.verified).length > 0) { if(!confirm(`Existem itens NÃO conferidos (Vermelhos). Salvar mesmo assim?`)) return; }
    if(Store.raw.some(i=>i.batch===batchName)) { alert('ERRO: LOTE JÁ EXISTE!'); return; }
    Store.raw.push(...Store.tempEntry.map(i=>({...i, batch: batchName, id: Date.now()+Math.random()})));
    Store.save();
    Store.tempEntry=[]; Entry.renderTemp(); batchInput.value=''; document.getElementById('xml-input').value='';
    Toast.show('Entrada Salva e Limpa!', 'success');
}
function clearEntry() { Store.tempEntry=[]; Entry.renderTemp(); }

// ======================================================
// --- GESTIÓN DE FICHAS TÉCNICAS (CORREGIDO PARA XML DE RECETAS) ---
// ======================================================
const Recipes = {
    render: function() {
        const tb = document.getElementById('recipes-body');
        if(!tb) return;
        if(!Store.recipes.length) { tb.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-muted">Vazio.</td></tr>'; return; }
        tb.innerHTML = Store.recipes.map((r, i) => `<tr><td><span class="badge bg-light text-dark border">${r.id}</span></td><td class="fw-bold text-primary">${r.name}</td><td class="text-center"><small class="text-muted">${r.items.map(item => item.name).join(', ').substring(0,30)}...</small></td><td class="text-end"><button class="btn btn-sm btn-outline-primary me-1" onclick="Recipes.edit(${i})"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-outline-danger" onclick="Recipes.remove(${i})"><i class="fas fa-trash"></i></button></td></tr>`).join('');
    },
    remove: function(index) {
        if(!confirm('Apagar esta Ficha Técnica?')) return;
        Store.recipes.splice(index, 1); Store.save(); this.render();
    },
    addManual: function() {
        Store.recipes.push({ id: 'REC-'+Date.now().toString().slice(-4), name: 'NOVA RECEITA', items: [{ name: '', qty: 0, unit: 'un' }] });
        Store.save(); this.edit(Store.recipes.length - 1);
    },
    triggerImport: function() { document.getElementById('ft-xml-input').click(); },
    
    // --- AQUÍ ESTABA EL ERROR, AHORA LEE "CONSUMO" ---
    processImport: function(input) {
        const file = input.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const parser = new DOMParser();
                const xml = parser.parseFromString(e.target.result, "text/xml");
                
                // Buscar nombre en <Modelo>, <xProd>, <Produto>
                const prodName = xml.querySelector('Identificacao Modelo, Modelo, xProd, Produto, Descricao, Name')?.textContent || "RECEITA IMPORTADA";
                
                // Buscar items en <Componente>, <Item>, <Ingrediente>
                const itemsNodes = xml.querySelectorAll('Componentes Componente, Componente, Item, Ingrediente, det');
                
                if(itemsNodes.length === 0) throw new Error("Sem itens");
                const newItems = [];
                
                itemsNodes.forEach(node => {
                    const name = node.querySelector('Descricao, xProd, Nome, Name')?.textContent || "Item";
                    
                    // CORRECCIÓN: AHORA BUSCA "Consumo" TAMBIÉN
                    const qty = parseFloat(node.querySelector('Consumo, qCom, Qtd, Quantidade, Qty')?.textContent) || 0;
                    
                    const unit = node.querySelector('Unidade, uCom, Unid')?.textContent || 'UN';
                    
                    if(qty > 0) newItems.push({ name: name.toUpperCase(), qty: qty, unit: unit });
                });
                
                Store.recipes.push({ id: 'FT-'+Date.now().toString().slice(-5), name: prodName.toUpperCase(), items: newItems });
                Store.save(); Recipes.render(); Toast.show('Importada com sucesso!', 'success');
            } catch(err) { 
                console.log(err);
                alert("Erro ao ler XML. Verifique se tem <Componente>, <Descricao> e <Consumo>."); 
            }
            input.value = '';
        };
        reader.readAsText(file);
    },
    
    edit: function(index) {
        const r = Store.recipes[index];
        document.getElementById('recipe-edit-index').value = index;
        document.getElementById('recipe-edit-name').value = r.name;
        const tbody = document.getElementById('recipe-edit-body');
        tbody.innerHTML = '';
        r.items.forEach(item => Recipes.addItemToModal(item));
        new bootstrap.Modal(document.getElementById('recipeEditModal')).show();
    },
    addItemToModal: function(item = {name:'', qty:0, unit:'un'}) {
        const tbody = document.getElementById('recipe-edit-body');
        const row = document.createElement('tr');
        row.innerHTML = `<td><input type="text" class="form-control form-control-sm item-name" value="${item.name}" placeholder="Nome"></td><td><input type="number" step="0.01" class="form-control form-control-sm item-qty" value="${item.qty}"></td><td><input type="text" class="form-control form-control-sm item-unit" value="${item.unit}"></td><td class="text-end"><button class="btn btn-sm text-danger" onclick="this.closest('tr').remove()"><i class="fas fa-times"></i></button></td>`;
        tbody.appendChild(row);
    },
    saveEdited: function() {
        const index = document.getElementById('recipe-edit-index').value;
        const name = document.getElementById('recipe-edit-name').value;
        const rows = document.querySelectorAll('#recipe-edit-body tr');
        const items = [];
        rows.forEach(row => {
            const n = row.querySelector('.item-name').value.toUpperCase();
            const q = parseFloat(row.querySelector('.item-qty').value);
            const u = row.querySelector('.item-unit').value;
            if(n && q > 0) items.push({ name: n, qty: q, unit: u });
        });
        if(!name || items.length === 0) return alert("Preencha o nome e itens");
        Store.recipes[index].name = name.toUpperCase();
        Store.recipes[index].items = items;
        Store.save();
        Recipes.render();
        bootstrap.Modal.getInstance(document.getElementById('recipeEditModal')).hide();
        Toast.show('Atualizada!', 'success');
    }
};

// --- PRODUCCIÓN ---
const Production = {
    loadRecipes: function() { document.getElementById('recipe-select').innerHTML = '<option value="">Selecione...</option>' + Store.recipes.map((r, i) => `<option value="${i}">${r.name}</option>`).join(''); },
    refreshBatches: function() { const batches = [...new Set(Store.raw.filter(i => i.qty > 0).map(i => i.batch))]; document.getElementById('prod-batch-select').innerHTML = '<option value="">Selecione Lote...</option>' + batches.map(b => `<option value="${b}">${b}</option>`).join(''); },
    calc: function() {
        const recipeIdx = document.getElementById('recipe-select').value;
        const batchName = document.getElementById('prod-batch-select').value;
        const qtyToProduce = parseInt(document.getElementById('prod-qty').value) || 0;
        const tbody = document.getElementById('prod-calc-body');
        const btn = document.getElementById('btn-finish-prod');
        document.getElementById('planned-qty').value = qtyToProduce;

        if (recipeIdx === "" || batchName === "") { tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-muted">Configure...</td></tr>'; btn.disabled = true; return; }

        const recipe = Store.recipes[recipeIdx];
        let html = '';
        let possible = true;

        recipe.items.forEach(ingredient => {
            const neededTotal = qtyToProduce * ingredient.qty;
            const stockItem = Store.raw.find(row => row.batch === batchName && row.desc.toUpperCase().includes(ingredient.name.toUpperCase()));
            let statusHtml = '';
            if (stockItem) {
                const available = stockItem.qty;
                if (available >= neededTotal) statusHtml = `<span class="badge bg-success">OK (${available})</span>`;
                else { statusHtml = `<span class="badge bg-danger">Falta ${(neededTotal-available).toFixed(1)}</span>`; possible = false; }
            } else { statusHtml = `<span class="badge bg-secondary">Não achado</span>`; possible = false; }
            html += `<tr><td><b>${ingredient.name}</b></td><td class="text-center">${ingredient.qty}</td><td class="text-center fw-bold">${neededTotal.toFixed(1)}</td><td class="text-end">${statusHtml}</td></tr>`;
        });
        tbody.innerHTML = html;
        if (qtyToProduce > 0 && possible) { btn.disabled = false; btn.className = 'btn btn-success w-100 py-3 fw-bold shadow-sm'; } 
        else { btn.disabled = true; btn.className = 'btn btn-secondary w-100 py-3 fw-bold'; }
    }
};
function calcProduction() { Production.calc(); }

function finishProduction() {
    const recipeIdx = document.getElementById('recipe-select').value;
    const batchName = document.getElementById('prod-batch-select').value;
    const qtyReal = parseInt(document.getElementById('real-qty').value);
    const wPP = parseFloat(document.getElementById('waste-pp').value)||0;
    const wPE = parseFloat(document.getElementById('waste-pe').value)||0;
    const wMix = parseFloat(document.getElementById('waste-mix').value)||0;
    const wTrash = parseFloat(document.getElementById('waste-trash').value)||0;
    const totalWaste = wPP + wPE + wMix + wTrash;

    if(!qtyReal || qtyReal <= 0) return Toast.show('Digite a Quantidade REAL!', 'error');
    if(!confirm(`Confirmar Produção REAL de ${qtyReal} un?`)) return;

    const recipe = Store.recipes[recipeIdx];
    let totalRealWeight = 0;

    recipe.items.forEach(ingredient => {
        const consumption = qtyReal * ingredient.qty;
        const index = Store.raw.findIndex(row => row.batch === batchName && row.desc.toUpperCase().includes(ingredient.name.toUpperCase()));
        if (index !== -1) {
            const item = Store.raw[index];
            item.qty -= consumption;
            const wLost = consumption * item.unitWeight;
            item.totalWeight -= wLost;
            totalRealWeight += wLost;
            if(item.qty < 0) item.qty = 0;
            if(item.totalWeight < 0) item.totalWeight = 0;
        }
    });

    Store.finished.push({
        id: Date.now(), date: new Date().toLocaleString(), originBatch: batchName, 
        desc: recipe.name, qty: qtyReal, weightTheoretical: totalRealWeight, 
        wasteTotal: totalWaste, wasteDetail: { pp: wPP, pe: wPE, mix: wMix, trash: wTrash }
    });

    Store.save();
    Toast.show('Produção Finalizada!', 'success');
    document.getElementById('prod-qty').value = '';
    document.getElementById('real-qty').value = '';
    document.getElementById('waste-pp').value = '';
    loadView('acabado');
}

// --- UTILS ---
const Stock={render:()=>{document.getElementById('stock-body').innerHTML=Store.raw.map(i=>`<tr><td>${i.batch}</td><td>${i.desc}</td><td>${i.qty.toFixed(1)}</td><td>${i.totalWeight.toFixed(2)}</td><td>${i.unitWeight.toFixed(4)}</td><td class="text-end"><button class="btn btn-danger btn-sm" onclick="Stock.remove('${i.id}')">X</button></td></tr>`).join('')}, remove:(id)=>{Store.raw=Store.raw.filter(x=>String(x.id)!==String(id));Store.save();Stock.render()}};
const Finished={render:()=>{
    const tb = document.getElementById('finished-body');
    if(!Store.finished.length) return tb.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-muted">Vazio.</td></tr>`;
    tb.innerHTML = Store.finished.map(i => {
        const w = i.wasteDetail || { pp:0, pe:0, mix:0, trash:0 };
        const wasteInfo = (i.wasteTotal > 0) ? `<span class="badge bg-danger" title="PP:${w.pp} PE:${w.pe} ...">-${i.wasteTotal.toFixed(2)} kg</span>` : '<span class="badge bg-success">0 kg</span>';
        return `<tr><td>${i.date.split(',')[0]}</td><td>${i.originBatch}</td><td>${i.desc}</td><td class="fw-bold fs-5">${i.qty}</td><td class="text-end">${wasteInfo}</td></tr>`;
    }).join('');
}};
const Dispatch={render:()=>{const s=document.getElementById('dispatch-select');const a=Store.finished.filter(i=>i.qty>0);s.innerHTML=a.length?a.map(i=>`<option value="${i.id}">${i.desc} (${i.originBatch}) - Qtd: ${i.qty}</option>`).join(''):'<option>Vazio</option>'}};
function processDispatch(){const id=document.getElementById('dispatch-select').value;const q=parseInt(document.getElementById('dispatch-qty').value);const c=document.getElementById('dispatch-client').value;if(!id||!q||!c)return Toast.show('Preencha tudo','error');const idx=Store.finished.findIndex(i=>String(i.id)===id);if(idx!==-1&&Store.finished[idx].qty>=q){Store.finished[idx].qty-=q;Store.save();Toast.show('Saída OK!','success');Dispatch.render();document.getElementById('dispatch-qty').value=''}else Toast.show('Erro estoque','error')};
function triggerXML(){if(!document.getElementById('in-batch').value)return Toast.show('Lote?','error');document.getElementById('xml-input').click()}
function openManualModal(){new bootstrap.Modal(document.getElementById('manualItemModal')).show()}
document.getElementById('manual-form').addEventListener('submit',function(e){e.preventDefault();const d=document.getElementById('m-desc').value;const q=parseFloat(document.getElementById('m-qty').value);const w=parseFloat(document.getElementById('m-weight').value)||0;const t=document.getElementById('m-type').value;Entry.addTemp({id:Date.now(),code:'MANUAL',desc:d,qty:q,totalWeight:w,unitWeight:(q>0?w/q:0),type:t,verified:true});bootstrap.Modal.getInstance(document.getElementById('manualItemModal')).hide();e.target.reset()});
function openScanner(t){const m=new bootstrap.Modal(document.getElementById('scannerModal'));m.show();setTimeout(()=>{html5QrCode=new Html5Qrcode("reader");html5QrCode.start({facingMode:"environment"},{fps:10,qrbox:250},(txt)=>{document.getElementById(t).value=txt;html5QrCode.stop().then(()=>{m.hide();if(t==='prod-batch-search')loadBatchForProd()})})},300)}
function exportExcel(){const w=XLSX.utils.json_to_sheet(Store.raw);const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,w,"Estoque");XLSX.writeFile(b,"Estoque.xlsx")}
const Dashboard={render:()=>{const elRaw=document.getElementById('kpi-raw');const elFin=document.getElementById('kpi-finished');const elWei=document.getElementById('kpi-weight');if(elRaw)elRaw.innerText=Store.raw.length;if(elFin)elFin.innerText=Store.finished.reduce((a,i)=>a+i.qty,0);if(elWei)elWei.innerText=Store.raw.reduce((a,i)=>a+(i.totalWeight||0),0).toFixed(2)+' kg'}};
Dashboard.render();