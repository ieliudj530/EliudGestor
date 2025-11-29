// ======================================================
// MAIN.JS - GESTIÓN ERP (VERSIÓN FINAL LIMPIEZA TOTAL)
// ======================================================

console.log("SISTEMA CARGADO: v3.0 (Limpieza Automática)");

// --- 1. GESTIÓN DE DATOS (STORE) ---
const Store = {
    raw: JSON.parse(localStorage.getItem('erp_raw')) || [],
    finished: JSON.parse(localStorage.getItem('erp_finished')) || [],
    tempEntry: [],
    prodContext: { batch: null, items: [], commonItems: [] },
    
    save: function() {
        localStorage.setItem('erp_raw', JSON.stringify(this.raw));
        localStorage.setItem('erp_finished', JSON.stringify(this.finished));
        Dashboard.render();
    }
};

// --- 2. NOTIFICACIONES (TOAST) ---
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

// --- 3. LOGIN ---
document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const u = document.getElementById('u-name').value;
    const p = document.getElementById('u-pass').value;
    if(u==='admin' && p==='1234'){
        document.getElementById('login-screen').style.display='none';
        document.getElementById('app-content').style.filter='none';
        Dashboard.render();
    } else {
        Toast.show('Erro: Tente admin / 1234', 'error');
    }
});
function logout() { if(confirm('Sair?')) location.reload(); }

// --- 4. NAVEGACIÓN ---
function loadView(id) {
    document.querySelectorAll('.view-section').forEach(el=>el.style.display='none');
    document.getElementById(`view-${id}`).style.display='block';
    document.getElementById('page-title').innerText = id.toUpperCase();
    document.getElementById('sidebar').classList.remove('show');
    document.getElementById('sidebar-overlay').classList.remove('show');

    if(id==='estoque') Stock.render();
    if(id==='acabado') Finished.render();
    if(id==='producao') Production.updateCommonSelect();
    if(id==='saida') Dispatch.render();
}
function toggleSidebar() { 
    document.getElementById('sidebar').classList.toggle('show');
    document.getElementById('sidebar-overlay').classList.toggle('show');
}

// --- 5. ENTRADA (INBOUND) ---
const Entry = {
    addTemp: function(i) { Store.tempEntry.push(i); this.renderTemp(); },
    
    renderTemp: function() {
        const tb = document.getElementById('temp-entry-body');
        // Si está vacío, mostrar mensaje
        if(!Store.tempEntry || Store.tempEntry.length === 0) {
            tb.innerHTML='<tr><td colspan="6" class="text-center py-5 text-muted">A lista está vazia. Aguardando itens...</td></tr>';
            return;
        }
        
        // Renderizar items
        tb.innerHTML = Store.tempEntry.map((i,x) => `
            <tr>
                <td class="fw-bold">${i.desc}</td>
                <td class="text-center">${i.qty}</td>
                <td class="text-center">${i.totalWeight}</td>
                <td class="text-center text-primary fw-bold">${i.unitWeight.toFixed(4)}</td>
                <td class="text-center">${i.type}</td>
                <td class="text-end"><button class="btn btn-sm btn-outline-danger" onclick="Entry.remove(${x})">X</button></td>
            </tr>`).join('');
    },
    remove: function(x) { Store.tempEntry.splice(x,1); this.renderTemp(); }
};

// Modal Manual
function openManualModal() { new bootstrap.Modal(document.getElementById('manualItemModal')).show(); }

document.getElementById('manual-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const d=document.getElementById('m-desc').value;
    const q=parseInt(document.getElementById('m-qty').value);
    const w=parseFloat(document.getElementById('m-weight').value)||0;
    const t=document.getElementById('m-type').value;
    const unitW = q > 0 ? (w / q) : 0;
    Entry.addTemp({ id:Date.now(), desc:d, qty:q, totalWeight:w, unitWeight: unitW, type:t });
    bootstrap.Modal.getInstance(document.getElementById('manualItemModal')).hide(); 
    e.target.reset();
});

function triggerXML() { if(!document.getElementById('in-batch').value) return Toast.show('Digite o Lote!','error'); document.getElementById('xml-input').click(); }

// --- LECTURA REAL DE XML ---
function processXML(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(e.target.result, "text/xml");
            const items = xmlDoc.getElementsByTagName("det");
            
            if (items.length === 0) return Toast.show('XML inválido', 'error');

            let importCount = 0;
            for (let i = 0; i < items.length; i++) {
                const prod = items[i].getElementsByTagName("prod")[0];
                const desc = prod.getElementsByTagName("xProd")[0].textContent;
                const qty = parseFloat(prod.getElementsByTagName("qCom")[0].textContent);
                const unit = prod.getElementsByTagName("uCom")[0].textContent; 

                // Lógica Peso
                let totalWeight = 0;
                if (unit.toUpperCase() === 'KG') {
                    totalWeight = qty;
                } else {
                    const uTrib = prod.getElementsByTagName("uTrib")[0]?.textContent;
                    const qTrib = parseFloat(prod.getElementsByTagName("qTrib")[0]?.textContent);
                    if (uTrib && uTrib.toUpperCase() === 'KG' && !isNaN(qTrib)) totalWeight = qTrib;
                }

                let unitWeight = (qty > 0 && totalWeight > 0) ? totalWeight / qty : 0;
                let type = (desc.toUpperCase().includes('FIO') || desc.toUpperCase().includes('COLA')) ? 'COMUM' : 'KIT';

                Entry.addTemp({ 
                    id: Date.now() + i, desc: desc, qty: qty, 
                    totalWeight: parseFloat(totalWeight.toFixed(3)), 
                    unitWeight: parseFloat(unitWeight.toFixed(4)), 
                    type: type 
                });
                importCount++;
            }
            Toast.show(`${importCount} itens importados!`, 'success');
        } catch (error) {
            console.error(error);
            Toast.show('Erro ao ler XML.', 'error');
        }
        input.value = ''; 
    };
    reader.readAsText(file);
}

// =================================================================
// --- FUNCIÓN DE GUARDADO (BLOQUEA DUPLICADOS + LIMPIEZA TOTAL) ---
// =================================================================
function commitEntry() {
    const batchInput = document.getElementById('in-batch');
    const xmlInput = document.getElementById('xml-input');
    const batchName = batchInput.value.toUpperCase().trim();
    
    // 1. Validar
    if(!batchName) return Toast.show('Digite o Lote/NF!', 'error');
    if(!Store.tempEntry.length) return Toast.show('Lista vazia!', 'error');

    // 2. DETECTAR NF YA EXISTENTE (BLOQUEO)
    // Busca si este lote ya existe en la base de datos
    const existe = Store.raw.some(item => item.batch === batchName);

    if (existe) {
        alert(`ATENÇÃO: A NF/Lote "${batchName}" já existe no sistema!\nNão é permitido duplicar.\n\nVerifique o número ou use um nome diferente.`);
        return Toast.show('Operação cancelada: NF Duplicada', 'error');
    }

    // 3. AGREGAR NUEVOS ITEMS
    // Como la NF es nueva, agregamos todo
    const newItems = Store.tempEntry.map(item => ({
        ...item,
        batch: batchName,
        id: Date.now() + Math.random() // ID único
    }));

    Store.raw.push(...newItems);
    Store.save();

    // 4. LIMPIEZA VISUAL COMPLETA
    Store.tempEntry = []; // Vaciar memoria
    
    // Forzar repintado de tabla vacía
    const tb = document.getElementById('temp-entry-body');
    tb.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-muted">A lista está vazia. Aguardando itens...</td></tr>';
    
    batchInput.value = ''; // Borrar lote
    xmlInput.value = '';   // Borrar archivo

    Toast.show(`Sucesso! NF ${batchName} salva. Tela Limpa.`, 'success');
}

function clearEntry() { Store.tempEntry=[]; Entry.renderTemp(); }


// ======================================================
// --- 6. PRODUCCIÓN ---
// ======================================================

function getItemFactor(description) {
    const name = description.toLowerCase();
    if (name.includes('alça') || name.includes('alca')) return 4;
    return 1; 
}

const Production = {
    updateCommonSelect: function() {
        const u = [...new Set(Store.raw.filter(i=>i.type==='COMUM').map(i=>i.desc))];
        document.getElementById('common-item-select').innerHTML = u.length ? u.map(x=>`<option value="${x}">${x}</option>`).join('') : '<option>Sem insumos comuns</option>';
    },
    calc: function() {
        const qtyToProduce = parseInt(document.getElementById('prod-qty').value) || 0;
        let html = '';
        let totalTheoreticalWeight = 0;

        if (!Store.prodContext.items.length) {
            document.getElementById('prod-calc-body').innerHTML = '<tr><td colspan="4" class="text-center py-5">Carregue um lote...</td></tr>';
            return;
        }

        Store.prodContext.items.forEach(item => {
            const factor = getItemFactor(item.desc);
            const neededQty = qtyToProduce * factor;
            const estimatedWeight = neededQty * item.unitWeight;
            totalTheoreticalWeight += estimatedWeight;
            const isLow = neededQty > item.qty;
            
            html += `<tr>
                <td><b>${item.desc}</b><br><small>Disp: ${item.qty}</small></td>
                <td class="text-center bg-light text-primary fw-bold">${factor}x</td>
                <td class="text-center"><b>${neededQty}</b> ${isLow ? '<span class="badge bg-danger">Falta</span>' : '<i class="fas fa-check text-success"></i>'}</td>
                <td class="text-end fw-bold">${estimatedWeight.toFixed(2)} kg</td>
            </tr>`;
        });

        Store.prodContext.commonItems.forEach(item => {
            const weightKg = (qtyToProduce * item.grams) / 1000;
            totalTheoreticalWeight += weightKg;
            html += `<tr style="border-left:3px solid #fbbf24"><td class="fst-italic">${item.desc}</td><td class="text-center">${item.grams} g</td><td>-</td><td class="text-end">${weightKg.toFixed(3)} kg</td></tr>`;
        });

        document.getElementById('prod-calc-body').innerHTML = html;
        document.getElementById('total-weight-calc').innerText = totalTheoreticalWeight.toFixed(2) + ' kg';
        
        const isPossible = Store.prodContext.items.every(i => (qtyToProduce * getItemFactor(i.desc)) <= i.qty);
        const btn = document.getElementById('btn-finish-prod');
        btn.disabled = !(qtyToProduce > 0 && isPossible);
        btn.className = (qtyToProduce > 0 && isPossible) ? 'btn btn-success w-100 py-3 fw-bold' : 'btn btn-secondary w-100 py-3 fw-bold';
    }
};

function loadBatchForProd() {
    const batchSearch = document.getElementById('prod-batch-search').value.toUpperCase();
    const itemsFound = Store.raw.filter(x => x.batch === batchSearch && x.qty > 0);
    if (itemsFound.length === 0) return Toast.show('Lote não encontrado', 'error');

    Store.prodContext = { batch: batchSearch, items: itemsFound, commonItems: [] };
    document.getElementById('prod-config-area').style.opacity = '1';
    document.getElementById('prod-config-area').style.pointerEvents = 'all';
    document.getElementById('active-batch-badge').innerText = batchSearch;
    document.getElementById('active-batch-badge').className = 'badge bg-primary p-2';
    Production.updateCommonSelect();
    Production.calc(); 
    Toast.show('Lote carregado!', 'success');
}

function addCommonItem() {
    const name = document.getElementById('common-item-select').value;
    const grams = parseFloat(document.getElementById('common-grams').value);
    if (name && grams) {
        Store.prodContext.commonItems.push({ desc: name, grams: grams });
        Production.calc();
    }
}
function calcProduction() { Production.calc(); }

function finishProduction() {
    const qtyToProduce = parseInt(document.getElementById('prod-qty').value);
    const waste = parseFloat(document.getElementById('prod-waste').value) || 0;
    if (!confirm(`Produzir ${qtyToProduce} unidades?`)) return;

    Store.prodContext.items.forEach(item => {
        const factor = getItemFactor(item.desc);
        const realIndex = Store.raw.findIndex(r => r.id === item.id);
        if (realIndex !== -1) {
            Store.raw[realIndex].qty -= (qtyToProduce * factor);
            Store.raw[realIndex].totalWeight -= ((qtyToProduce * factor) * item.unitWeight);
            if(Store.raw[realIndex].qty < 0) Store.raw[realIndex].qty = 0;
        }
    });

    Store.prodContext.commonItems.forEach(cItem => {
        const stockItemIndex = Store.raw.findIndex(r => r.desc === cItem.desc && r.type === 'COMUM' && r.totalWeight > 0);
        if (stockItemIndex !== -1) Store.raw[stockItemIndex].totalWeight -= ((qtyToProduce * cItem.grams) / 1000);
    });

    const theoreticalWeight = parseFloat(document.getElementById('total-weight-calc').innerText);
    Store.finished.push({
        id: Date.now(), date: new Date().toLocaleString(), originBatch: Store.prodContext.batch,
        qty: qtyToProduce, weightTheoretical: theoreticalWeight, weightWaste: waste, weightTotal: theoreticalWeight + waste
    });

    Store.save();
    Toast.show('Produção OK!', 'success');
    
    // Reset UI Prod
    document.getElementById('prod-qty').value = '';
    document.getElementById('prod-waste').value = '';
    document.getElementById('active-batch-badge').innerText = 'Nenhum';
    document.getElementById('prod-config-area').style.opacity = '0.5';
    document.getElementById('prod-config-area').style.pointerEvents = 'none';
    document.getElementById('prod-calc-body').innerHTML = '';
    document.getElementById('total-weight-calc').innerText = '0.00 kg';
}

// --- UTILIDADES ---
const Stock = { render:()=>{ document.getElementById('stock-body').innerHTML = Store.raw.map(i=>`<tr><td><span class="badge bg-light text-dark border">${i.batch}</span></td><td>${i.desc}</td><td>${i.qty}</td><td>${i.totalWeight.toFixed(2)}</td><td>${i.unitWeight.toFixed(4)}</td></tr>`).join(''); }};
const Finished = { render:()=>{ document.getElementById('finished-body').innerHTML = Store.finished.map(i=>`<tr><td>${i.date}</td><td>${i.originBatch}</td><td class="fw-bold">${i.qty}</td><td>${i.weightTheoretical.toFixed(2)}</td><td><span class="badge bg-success">OK</span></td></tr>`).join(''); }};
const Dispatch = { render:()=>{ const s=document.getElementById('dispatch-select'); const a=Store.finished.filter(i=>i.qty>0); s.innerHTML = a.length ? a.map(i=>`<option value="${i.id}">${i.originBatch} (${i.qty})</option>`).join('') : '<option>Vazio</option>'; }};

function processDispatch() {
    const idStr = document.getElementById('dispatch-select').value;
    const q = parseInt(document.getElementById('dispatch-qty').value);
    const c = document.getElementById('dispatch-client').value;
    if(!idStr||!q||!c) return Toast.show('Preencha tudo','error');
    const idx = Store.finished.findIndex(i => String(i.id) === idStr);
    if(idx!==-1 && Store.finished[idx].qty>=q) {
        Store.finished[idx].qty-=q; Store.save(); Toast.show('Saída OK!','success'); Dispatch.render(); document.getElementById('dispatch-qty').value='';
    } else Toast.show('Erro estoque','error');
}

// Scanner
let html5QrCode;
function openScanner(target) {
    const m = new bootstrap.Modal(document.getElementById('scannerModal')); m.show();
    setTimeout(() => {
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (txt) => {
            document.getElementById(target).value = txt; html5QrCode.stop().then(() => { m.hide(); if(target==='prod-batch-search') loadBatchForProd(); });
        });
    }, 300);
    document.getElementById('scannerModal').addEventListener('hidden.bs.modal', ()=>{ if(html5QrCode) html5QrCode.stop(); });
}

function exportExcel(){ 
    if(!Store.raw.length) return Toast.show('Nada para exportar','error');
    const w = XLSX.utils.json_to_sheet(Store.raw);
    const b = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(b, w, "Estoque"); 
    XLSX.writeFile(b, "Estoque.xlsx"); 
}

// Init
Dashboard.render = function() {
    document.getElementById('kpi-raw').innerText = Store.raw.length;
    document.getElementById('kpi-finished').innerText = Store.finished.reduce((a,i)=>a+i.qty,0);
    document.getElementById('kpi-weight').innerText = Store.raw.reduce((a,i)=>a+(i.totalWeight||0),0).toFixed(2)+' kg';
    
    const ctx = document.getElementById('mainChart').getContext('2d');
    if(window.myChart) window.myChart.destroy();
    
    window.myChart = new Chart(ctx, { 
        type:'bar', 
        data:{
            labels:['Matéria Prima (Lotes)','Big Bags Prontas (Lotes)'],
            datasets:[{
                label:'Quantidade de Lotes',
                data:[Store.raw.length, Store.finished.length],
                backgroundColor:['#0f172a','#10b981'],
                borderRadius: 5
            }]
        }, 
        options:{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        } 
    });
};
Dashboard.render();