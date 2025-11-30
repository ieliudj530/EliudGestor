// ======================================================
// MAIN.JS - GESTIÓN ERP (PROTOTIPO CON RECETAS)
// ======================================================

console.log("SISTEMA CARGADO: v4.0 (Recetas + Lotes)");

// --- 1. GESTIÓN DE DATOS (STORE) ---
const Store = {
    raw: JSON.parse(localStorage.getItem('erp_raw')) || [],
    finished: JSON.parse(localStorage.getItem('erp_finished')) || [],
    
    // AQUÍ ESTÁN TUS RECETAS (FICHAS TÉCNICAS) PRE-CARGADAS
    // En el futuro, esto se llenará con XML.
    recipes: [
        {
            id: 'REC-001',
            name: 'BIG BAG 90x90x120 (Standard)',
            items: [
                { name: 'TECIDO', qty: 2.5, unit: 'm' },     // Busca algo que diga "Tecido"
                { name: 'ALÇA', qty: 4, unit: 'un' },        // Busca algo que diga "Alça"
                { name: 'LINER', qty: 1, unit: 'un' },       // Busca algo que diga "Liner"
                { name: 'FIO', qty: 0.05, unit: 'kg' }       // Busca hilo
            ]
        },
        {
            id: 'REC-002',
            name: 'BIG BAG COM VÁLVULA (Especial)',
            items: [
                { name: 'TECIDO', qty: 3.0, unit: 'm' },
                { name: 'ALÇA', qty: 4, unit: 'un' },
                { name: 'VÁLVULA', qty: 2, unit: 'un' },     // Usa Válvulas
                { name: 'FIO', qty: 0.08, unit: 'kg' }
            ]
        }
    ],

    tempEntry: [],
    
    save: function() {
        localStorage.setItem('erp_raw', JSON.stringify(this.raw));
        localStorage.setItem('erp_finished', JSON.stringify(this.finished));
        Dashboard.render();
    }
};

// --- 2. NOTIFICACIONES ---
const Toast = {
    show: function(msg, type='info') {
        const c = document.getElementById('toast-area');
        const color = type==='success'?'bg-success':type==='error'?'bg-danger':'bg-primary';
        const el = document.createElement('div');
        el.className = `toast show align-items-center text-white border-0 mb-2 shadow-lg ${color}`;
        el.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
        c.appendChild(el); 
        setTimeout(()=>el.remove(), 4000);
    }
};

// --- 3. LOGIN & NAV ---
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
    
    // AL ENTRAR A PRODUCCIÓN, CARGAMOS LAS LISTAS
    if(id==='producao') {
        Production.loadRecipes();
        Production.refreshBatches();
    }
}
function toggleSidebar() { 
    document.getElementById('sidebar').classList.toggle('show');
    document.getElementById('sidebar-overlay').classList.toggle('show');
}

// --- 4. ENTRADA (Mismo código blindado) ---
const Entry = {
    addTemp: function(i) { Store.tempEntry.push(i); this.renderTemp(); },
    renderTemp: function() {
        const tb = document.getElementById('temp-entry-body');
        if(!Store.tempEntry.length) return tb.innerHTML='<tr><td colspan="6" class="text-center py-5 text-muted">Aguardando itens...</td></tr>';
        tb.innerHTML = Store.tempEntry.map((i,x) => `<tr><td class="fw-bold">${i.desc}</td><td class="text-center">${i.qty}</td><td class="text-center">${i.totalWeight}</td><td class="text-center">${i.unitWeight.toFixed(4)}</td><td class="text-center">${i.type}</td><td class="text-end"><button class="btn btn-sm btn-outline-danger" onclick="Entry.remove(${x})">X</button></td></tr>`).join('');
    },
    remove: function(x) { Store.tempEntry.splice(x,1); this.renderTemp(); }
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
            const qty = parseFloat(prod.getElementsByTagName("qCom")[0].textContent);
            const unit = prod.getElementsByTagName("uCom")[0].textContent; 
            let totalWeight = (unit.toUpperCase()==='KG') ? qty : (parseFloat(prod.getElementsByTagName("qTrib")[0]?.textContent)||0);
            let unitWeight = (qty>0 && totalWeight>0) ? totalWeight/qty : 0;
            let type = (desc.toUpperCase().includes('FIO')||desc.toUpperCase().includes('COLA'))?'COMUM':'KIT';
            Entry.addTemp({ id: Date.now()+i, desc, qty, totalWeight, unitWeight, type });
        }
        Toast.show('XML Importado!', 'success');
        input.value='';
    };
    reader.readAsText(file);
}

function commitEntry() {
    const batchInput = document.getElementById('in-batch');
    const batchName = batchInput.value.toUpperCase().trim();
    if(!batchName || !Store.tempEntry.length) return Toast.show('Erro: Lote ou Lista vazia', 'error');
    
    if(Store.raw.some(i=>i.batch===batchName)) {
        alert('LOTE JÁ EXISTE!'); return;
    }
    
    Store.raw.push(...Store.tempEntry.map(i=>({...i, batch: batchName, id: Date.now()+Math.random()})));
    Store.save();
    
    Store.tempEntry=[]; Entry.renderTemp(); batchInput.value='';
    Toast.show('Entrada Salva!', 'success');
}
function clearEntry() { Store.tempEntry=[]; Entry.renderTemp(); }


// ======================================================
// --- 5. PRODUCCIÓN (LÓGICA NUEVA: RECETAS + LOTES) ---
// ======================================================

const Production = {
    // Cargar Dropdown de Recetas
    loadRecipes: function() {
        const sel = document.getElementById('recipe-select');
        sel.innerHTML = '<option value="">Selecione o Produto...</option>' + 
            Store.recipes.map((r, i) => `<option value="${i}">${r.name}</option>`).join('');
    },

    // Cargar Dropdown de Lotes Disponibles (Solo los que tienen stock)
    refreshBatches: function() {
        // Obtenemos lista única de lotes que tienen items con cantidad > 0
        const batches = [...new Set(Store.raw.filter(i => i.qty > 0).map(i => i.batch))];
        const sel = document.getElementById('prod-batch-select');
        sel.innerHTML = '<option value="">Selecione o Lote de Origem...</option>' + 
            batches.map(b => `<option value="${b}">${b}</option>`).join('');
    },

    calc: function() {
        const recipeIdx = document.getElementById('recipe-select').value;
        const batchName = document.getElementById('prod-batch-select').value;
        const qtyToProduce = parseInt(document.getElementById('prod-qty').value) || 0;
        const tbody = document.getElementById('prod-calc-body');
        const btn = document.getElementById('btn-finish-prod');

        if (recipeIdx === "" || batchName === "") {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-muted">Selecione Produto e Lote...</td></tr>';
            btn.disabled = true;
            return;
        }

        const recipe = Store.recipes[recipeIdx];
        let html = '';
        let totalWeight = 0;
        let possible = true;

        // RECORRER INGREDIENTES DE LA RECETA
        recipe.items.forEach(ingredient => {
            const neededTotal = qtyToProduce * ingredient.qty;
            
            // BUSCAR EN EL LOTE SELECCIONADO:
            // Buscamos un item en ese lote que contenga el nombre del ingrediente (Ej: "Tecido" busca "Tecido Tubular...")
            const stockItem = Store.raw.find(row => 
                row.batch === batchName && 
                row.desc.toUpperCase().includes(ingredient.name.toUpperCase())
            );

            let statusHtml = '';
            let estimatedW = 0;

            if (stockItem) {
                // Si encontramos el material en el lote
                const available = stockItem.qty;
                estimatedW = neededTotal * stockItem.unitWeight;
                
                if (available >= neededTotal) {
                    statusHtml = `<span class="badge bg-success">OK (Disp: ${available})</span>`;
                } else {
                    statusHtml = `<span class="badge bg-danger">FALTA: ${(neededTotal - available).toFixed(1)}</span>`;
                    possible = false;
                }
            } else {
                // Si NO encontramos el material en el lote
                statusHtml = `<span class="badge bg-secondary">Não encontrado no Lote</span>`;
                // Para el prototipo, asumimos que si no está, no se puede producir
                possible = false; 
            }

            totalWeight += estimatedW;

            html += `
                <tr>
                    <td>
                        <b>${ingredient.name}</b><br>
                        <small class="text-muted">${stockItem ? stockItem.desc.substring(0,20)+'...' : '---'}</small>
                    </td>
                    <td class="text-center">${ingredient.qty} ${ingredient.unit}</td>
                    <td class="text-center fw-bold">${neededTotal}</td>
                    <td class="text-end">${statusHtml}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        document.getElementById('total-weight-calc').innerText = totalWeight.toFixed(2) + ' kg';

        // Habilitar botón solo si todo es posible y la cantidad > 0
        if (qtyToProduce > 0 && possible) {
            btn.disabled = false;
            btn.className = 'btn btn-success w-100 py-3 fw-bold shadow-sm';
            btn.innerHTML = '<i class="fas fa-check-circle me-2"></i> CONFIRMAR PRODUÇÃO';
        } else {
            btn.disabled = true;
            btn.className = 'btn btn-secondary w-100 py-3 fw-bold';
            btn.innerHTML = possible ? 'Defina a Quantidade...' : 'ESTOQUE INSUFICIENTE / ITEM FALTANTE';
        }
    }
};

function calcProduction() { Production.calc(); }

function finishProduction() {
    const recipeIdx = document.getElementById('recipe-select').value;
    const batchName = document.getElementById('prod-batch-select').value;
    const qtyToProduce = parseInt(document.getElementById('prod-qty').value);
    const waste = parseFloat(document.getElementById('prod-waste').value) || 0;
    
    if(!confirm(`Confirma a produção de ${qtyToProduce} unidades do Lote ${batchName}?`)) return;

    const recipe = Store.recipes[recipeIdx];
    let totalRealWeight = 0;

    // DESCONTAR DEL STOCK
    recipe.items.forEach(ingredient => {
        const neededTotal = qtyToProduce * ingredient.qty;
        
        // Buscar el item exacto de nuevo para descontar
        const stockItemIndex = Store.raw.findIndex(row => 
            row.batch === batchName && 
            row.desc.toUpperCase().includes(ingredient.name.toUpperCase())
        );

        if (stockItemIndex !== -1) {
            const item = Store.raw[stockItemIndex];
            item.qty -= neededTotal;
            
            const weightConsumed = neededTotal * item.unitWeight;
            item.totalWeight -= weightConsumed;
            totalRealWeight += weightConsumed;

            // Evitar negativos
            if(item.qty < 0) item.qty = 0;
            if(item.totalWeight < 0) item.totalWeight = 0;
        }
    });

    // CREAR PRODUCTO ACABADO
    Store.finished.push({
        id: Date.now(),
        date: new Date().toLocaleString(),
        originBatch: batchName,
        desc: recipe.name, // El nombre de la receta es el nombre del producto final
        qty: qtyToProduce,
        weightTheoretical: totalRealWeight,
        weightWaste: waste,
        weightTotal: totalRealWeight + waste
    });

    Store.save();
    Toast.show('Produção Finalizada!', 'success');
    
    // Limpiar pantalla
    document.getElementById('prod-qty').value = '';
    document.getElementById('prod-waste').value = '';
    calcProduction(); // Refrescar tabla (para mostrar que el stock bajó)
}

// --- UTILIDADES (STOCK, ACABADOS, ETC) ---
const Stock = { render:()=>{ document.getElementById('stock-body').innerHTML = Store.raw.map(i=>`<tr><td><span class="badge bg-light text-dark border">${i.batch}</span></td><td>${i.desc}</td><td>${i.qty.toFixed(1)}</td><td>${i.totalWeight.toFixed(2)}</td><td>${i.unitWeight.toFixed(4)}</td><td class="text-end"><button class="btn btn-danger btn-sm" onclick="Stock.remove('${i.id}')">X</button></td></tr>`).join(''); }, remove: (id)=>{ Store.raw=Store.raw.filter(x=>String(x.id)!==String(id)); Store.save(); Stock.render(); }};
const Finished = { render:()=>{ document.getElementById('finished-body').innerHTML = Store.finished.map(i=>`<tr><td>${i.date}</td><td>${i.originBatch}</td><td class="fw-bold">${i.qty}</td><td>${i.weightTheoretical.toFixed(2)}</td><td><span class="badge bg-success">OK</span></td></tr>`).join(''); }};
const Dispatch = { render:()=>{ const s=document.getElementById('dispatch-select'); const a=Store.finished.filter(i=>i.qty>0); s.innerHTML = a.length ? a.map(i=>`<option value="${i.id}">${i.desc} (${i.originBatch}) - Qtd: ${i.qty}</option>`).join('') : '<option>Vazio</option>'; }};

function processDispatch() {
    const idStr=document.getElementById('dispatch-select').value; const q=parseInt(document.getElementById('dispatch-qty').value); const c=document.getElementById('dispatch-client').value;
    if(!idStr||!q||!c) return Toast.show('Preencha tudo','error');
    const idx=Store.finished.findIndex(i=>String(i.id)===idStr);
    if(idx!==-1 && Store.finished[idx].qty>=q) {
        Store.finished[idx].qty-=q; Store.save(); Toast.show('Saída OK!','success'); Dispatch.render(); document.getElementById('dispatch-qty').value='';
    } else Toast.show('Erro estoque','error');
}
function triggerXML() { if(!document.getElementById('in-batch').value) return Toast.show('Digite o Lote!','error'); document.getElementById('xml-input').click(); }
function openManualModal() { new bootstrap.Modal(document.getElementById('manualItemModal')).show(); }
document.getElementById('manual-form').addEventListener('submit', function(e) { e.preventDefault(); const d=document.getElementById('m-desc').value; const q=parseFloat(document.getElementById('m-qty').value); const w=parseFloat(document.getElementById('m-weight').value)||0; const t=document.getElementById('m-type').value; Entry.addTemp({id:Date.now(), desc:d, qty:q, totalWeight:w, unitWeight:(q>0?w/q:0), type:t}); bootstrap.Modal.getInstance(document.getElementById('manualItemModal')).hide(); e.target.reset(); });
function openScanner(t){ const m=new bootstrap.Modal(document.getElementById('scannerModal')); m.show(); setTimeout(()=>{ html5QrCode=new Html5Qrcode("reader"); html5QrCode.start({facingMode:"environment"},{fps:10,qrbox:250},(txt)=>{document.getElementById(t).value=txt; html5QrCode.stop().then(()=>{m.hide(); if(t==='prod-batch-search') loadBatchForProd();});});},300); }
function exportExcel(){ const w=XLSX.utils.json_to_sheet(Store.raw); const b=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(b,w,"Estoque"); XLSX.writeFile(b,"Estoque.xlsx"); }
const Dashboard={render:()=>{ document.getElementById('kpi-raw').innerText=Store.raw.length; document.getElementById('kpi-finished').innerText=Store.finished.reduce((a,i)=>a+i.qty,0); document.getElementById('kpi-weight').innerText=Store.raw.reduce((a,i)=>a+(i.totalWeight||0),0).toFixed(2)+' kg'; }};
Dashboard.render();