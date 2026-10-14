import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore, collection, addDoc, setDoc, updateDoc, doc, deleteDoc, onSnapshot, query, orderBy, limit, where, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ==========================================
// CONFIGURAÇÃO DO FIREBASE E CREDENCIAIS
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyDYXFu-soolSOoCAxNYlVVgeJVwzJef_fk",
    authDomain: "patiopark-7984f.firebaseapp.com",
    projectId: "patiopark-7984f",
    storageBucket: "patiopark-7984f.firebasestorage.app",
    messagingSenderId: "1057772370201",
    appId: "1:1057772370201:web:2da0185c98c15e28926d88"
};

const IMGBB_API_KEY = "eb75e9530b3092570067d4e63d367ad2";
const SENHA_ADMIN = "Biguidu2013@lhpm";

let app, db;
try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
} catch (error) {
    console.error("Erro ao inicializar o Firebase:", error);
}

// ==========================================
// VARIÁVEIS DE ESTADO GLOBAL
// ==========================================
let registrosPatioAtivo = []; 
let registrosHistorico = []; 
let logsAuditoria = []; 
let usuarios = [];

let usuarioLogado = null; 
let cargoLogado = 'OPERADOR'; 
let permissoesAtuais = {}; 
let isAdmin = false; 
let tutorialAtivo = false;

let registroSelecionadoFirebaseId = null; 
let fotoAtualUrl = null; 
let dataHoraMetadata = null; 
let gpsLocalizacao = null;

let modoSaidaAtual = 'A'; 
let fotoSaidaUrl = null; 
let dataHoraSaidaMetadata = null; 
let gpsSaidaLocalizacao = null;

let unsubscribePatioAtivo = null; 
let unsubscribeSchema = null; 
let unsubscribeUsuarios = null; 
let limitePaginacao = 50;

const permissoesAdminDev = { reg: true, pat: true, sai: true, pla: true, imp: true, edi: true, exc: true };

const camposPadrao = [
    { id: "placa", nome: "Placa", tipo: "placa", fixo: true }, 
    { id: "local", nome: "Local de Entrega", tipo: "text", fixo: false }, 
    { id: "motorista", nome: "Motorista Principal", tipo: "text", fixo: false }, 
    { id: "documento", nome: "Documento", tipo: "text", fixo: false }, 
    { id: "empresa", nome: "Nome da Empresa", tipo: "text", fixo: false }, 
    { id: "modelo", nome: "Modelo do Veículo", tipo: "select_modelo", fixo: false }, 
    { id: "nota", nome: "Nota Fiscal", tipo: "text", fixo: false }, 
    { id: "observacoes", nome: "Observações", tipo: "textarea", fixo: false }
];
let schemaCampos = [...camposPadrao];


// ==========================================
// MÓDULO: TUTORIAL INTERATIVO
// ==========================================
window.alternarModoTutorial = function() {
    tutorialAtivo = !tutorialAtivo;
    const btn = document.getElementById('btn-toggle-tutorial');
    const lbl = document.getElementById('lbl-tutorial');

    if (tutorialAtivo) {
        document.body.classList.add('tutorial-ativo');
        btn.className = "bg-amber-400 hover:bg-amber-300 text-blue-950 border border-amber-200 px-2.5 py-1.5 rounded-xl flex items-center space-x-1.5 transition shadow-md cursor-pointer";
        lbl.innerText = "Tutorial: ON";
        window.mostrarToast("Modo Tutorial Ativado!", "info");
    } else {
        document.body.classList.remove('tutorial-ativo');
        btn.className = "bg-blue-800 hover:bg-blue-700 text-blue-100 border border-blue-600 px-2.5 py-1.5 rounded-xl flex items-center space-x-1.5 transition shadow-sm cursor-pointer";
        lbl.innerText = "Tutorial: OFF";
        window.mostrarToast("Modo Tutorial Ocultado.", "info");
    }
};

const TextosGuiaTutorial = {
    DASHBOARD: { 
        titulo: "Dashboard", 
        html: `
            <div class="bg-blue-50 p-3 rounded-xl border border-blue-200 mb-3">
                <b class="text-blue-900 uppercase block mb-1">1. Indicadores</b>
                O card <b>No Pátio Agora</b> mostra quantos veículos entraram e aguardam saída.
            </div>
            <div class="bg-emerald-50 p-3 rounded-xl border border-emerald-200 mb-3">
                <b class="text-emerald-900 uppercase block mb-1">2. Produtividade</b>
                Contabiliza suas entradas e saídas carimbadas hoje.
            </div>
            <div class="bg-amber-50 p-3 rounded-xl border border-amber-200">
                <b class="text-amber-900 uppercase block mb-1">3. Permanência</b>
                Mostra a placa aguardando há mais tempo.
            </div>
        ` 
    },
    RADAR_DEV: { 
        titulo: "Radar Antifraude (DEV)", 
        html: `
            <div class="bg-red-50 p-3 rounded-xl border border-red-200 mb-3">
                <b class="text-red-900 uppercase block mb-1">1. Monitor Plano B</b>
                Conta saídas manuais sem foto.
            </div>
            <div class="bg-blue-50 p-3 rounded-xl border border-blue-200">
                <b class="text-blue-900 uppercase block mb-1">2. Restauração</b>
                Clique no Log para reverter exclusões ou edições erradas.
            </div>
        ` 
    },
    ENTRADA: { 
        titulo: "Registro de Entrada", 
        html: `
            <div class="bg-blue-50 p-3 rounded-xl border border-blue-200 mb-3">
                <b class="text-blue-900 uppercase block mb-1">Passo 1: Placa e Foto</b>
                A câmera comprime em WebP e extrai EXIF/GPS.
            </div>
            <div class="bg-indigo-50 p-3 rounded-xl border border-indigo-200 mb-3">
                <b class="text-indigo-900 uppercase block mb-1">Passo 2: Autopreencher</b>
                Se a placa já existe, use os dados antigos.
            </div>
            <div class="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                <b class="text-emerald-900 uppercase block mb-1">Passo 3: Assinatura</b>
                A entrada é carimbada com seu usuário.
            </div>
        ` 
    },
    PATIO: { 
        titulo: "Pátio e Saída", 
        html: `
            <div class="bg-blue-50 p-3 rounded-xl border border-blue-200 mb-3">
                <b class="text-blue-900 uppercase block mb-1">1. Ficha Completa</b>
                Toque no card do caminhão para ver detalhes, fotos e mapa.
            </div>
            <div class="bg-emerald-50 p-3 rounded-xl border border-emerald-200 mb-3">
                <b class="text-emerald-900 uppercase block mb-1">2. Plano A (Foto)</b>
                Tire foto para validar a hora EXIF e GPS da saída.
            </div>
            <div class="bg-amber-50 p-3 rounded-xl border border-amber-200">
                <b class="text-amber-900 uppercase block mb-1">3. Plano B (Manual)</b>
                Se a câmera falhar, digite a placa à mão e informe o motivo.
            </div>
        ` 
    },
    PLANILHA: { 
        titulo: "Histórico e PDF", 
        html: `
            <div class="bg-blue-50 p-3 rounded-xl border border-blue-200 mb-3">
                <b class="text-blue-900 uppercase block mb-1">1. Economia de Dados</b>
                Carrega apenas "Hoje". Busque outras datas sob demanda para não travar o celular.
            </div>
            <div class="bg-gray-100 p-3 rounded-xl border border-gray-300">
                <b class="text-gray-900 uppercase block mb-1">2. PDF Paisagem</b>
                Gera um relatório formatado em A4 deitado.
            </div>
        ` 
    },
    DEV_CONFIG: { 
        titulo: "Administração", 
        html: `
            <div class="bg-purple-50 p-3 rounded-xl border border-purple-200 mb-3">
                <b class="text-purple-900 uppercase block mb-1">1. RBAC (Permissões)</b>
                Libere ou bloqueie telas por checkbox para cada operador.
            </div>
            <div class="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                <b class="text-emerald-900 uppercase block mb-1">2. Construtor de Campos</b>
                Adicione ou mova campos e toda a equipe recebe a tela atualizada na mesma hora.
            </div>
        ` 
    }
};

window.abrirGuiaDetalhado = function(chave) { 
    const it = TextosGuiaTutorial[chave]; 
    if(!it) return; 
    document.getElementById('tutorial-modal-titulo').innerText = it.titulo; 
    document.getElementById('tutorial-modal-corpo').innerHTML = it.html; 
    document.getElementById('modal-guia-tutorial').classList.remove('hidden'); 
};

window.fecharModalGuiaTutorial = function() { 
    document.getElementById('modal-guia-tutorial').classList.add('hidden'); 
};


// ==========================================
// MÓDULO: INTERFACE E AVISOS NATIVOS
// ==========================================
window.mostrarToast = function(msg, tipo = 'sucesso') {
    const cont = document.getElementById('toast-container');
    const c = { 
        sucesso: 'bg-emerald-700 border-emerald-400 text-white', 
        erro: 'bg-red-700 border-red-400 text-white', 
        aviso: 'bg-amber-600 border-amber-300 text-white', 
        info: 'bg-blue-800 border-blue-400 text-white' 
    };
    const i = { 
        sucesso: 'fa-check-circle', 
        erro: 'fa-exclamation-triangle', 
        aviso: 'fa-exclamation-circle', 
        info: 'fa-info-circle' 
    };
    
    const t = document.createElement('div'); 
    t.className = `${c[tipo] || c.info} border-l-4 p-3.5 rounded-xl shadow-xl flex items-center space-x-3 pop-in pointer-events-auto`;
    t.innerHTML = `<i class="fas ${i[tipo] || i.info} text-lg"></i><span class="text-xs font-black uppercase tracking-wide flex-1">${msg}</span>`;
    
    cont.appendChild(t); 
    setTimeout(() => t.remove(), 3500);
};

window.appAlert = function(titulo, msg, tipo = 'info') {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-dialogo-app'); 
        const header = document.getElementById('dialogo-header'); 
        const icone = document.getElementById('dialogo-icone');
        
        header.className = tipo === 'erro' ? 'bg-red-700 text-white p-4 flex items-center space-x-3' : 
                           tipo === 'aviso' ? 'bg-amber-600 text-white p-4 flex items-center space-x-3' : 
                           'bg-blue-900 text-white p-4 flex items-center space-x-3';
        icone.className = tipo === 'erro' ? 'fas fa-times-circle text-2xl' : 
                          tipo === 'aviso' ? 'fas fa-exclamation-triangle text-2xl' : 
                          'fas fa-info-circle text-2xl';
                          
        document.getElementById('dialogo-titulo').innerText = titulo; 
        document.getElementById('dialogo-mensagem').innerText = msg;
        
        document.getElementById('dialogo-botoes').innerHTML = `
            <button id="btn-dialogo-ok" class="w-full bg-blue-700 hover:bg-blue-800 text-white font-black py-3 rounded-xl uppercase shadow">Entendido</button>
        `;
        
        modal.classList.remove('hidden'); 
        document.getElementById('btn-dialogo-ok').onclick = () => { 
            modal.classList.add('hidden'); 
            resolve(true); 
        };
    });
};

window.appConfirm = function(titulo, msg, textoBtn = 'Confirmar', perigo = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-dialogo-app'); 
        const header = document.getElementById('dialogo-header'); 
        const icone = document.getElementById('dialogo-icone');
        
        header.className = perigo ? 'bg-red-700 text-white p-4 flex items-center space-x-3' : 'bg-blue-900 text-white p-4 flex items-center space-x-3'; 
        icone.className = perigo ? 'fas fa-exclamation-triangle text-2xl' : 'fas fa-question-circle text-2xl';
        
        document.getElementById('dialogo-titulo').innerText = titulo; 
        document.getElementById('dialogo-mensagem').innerText = msg;
        
        const cor = perigo ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-700 hover:bg-blue-800';
        document.getElementById('dialogo-botoes').innerHTML = `
            <button id="btn-dialogo-cancel" class="flex-1 bg-gray-200 text-gray-800 font-black py-3 rounded-xl uppercase text-xs">Cancelar</button>
            <button id="btn-dialogo-yes" class="flex-1 ${cor} text-white font-black py-3 rounded-xl uppercase text-xs shadow">${textoBtn}</button>
        `;
        
        modal.classList.remove('hidden'); 
        document.getElementById('btn-dialogo-cancel').onclick = () => { modal.classList.add('hidden'); resolve(false); }; 
        document.getElementById('btn-dialogo-yes').onclick = () => { modal.classList.add('hidden'); resolve(true); };
    });
};


// ==========================================
// MÓDULO: EXIF, GPS E DATA
// ==========================================
function getDataHoraNavegador() { 
    const now = new Date(); 
    return `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`; 
}

function obterDataString(tipo) { 
    const d = new Date(); 
    if(tipo === 'ONTEM') d.setDate(d.getDate() - 1); 
    return d.toLocaleDateString('pt-BR'); 
}

function dec(d, ref) {
    if(!d || d.length < 3) return null;
    let dc = Number(d[0]) + (Number(d[1])/60) + (Number(d[2])/3600);
    if(ref === 'S' || ref === 'W') dc *= -1;
    return dc.toFixed(6);
}

function extrairMetadadosFoto(file) {
    return new Promise((resolve) => {
        let hr = null; 
        let gp = null;
        
        EXIF.getData(file, function() {
            const ed = EXIF.getTag(this, "DateTimeOriginal");
            if(ed) { 
                const p = ed.split(' '); 
                const d = p[0].split(':'); 
                hr = `${d[2]}/${d[1]}/${d[0]} ${p[1].substring(0,5)} (EXIF)`; 
            } else {
                hr = `${new Date(file.lastModified).toLocaleDateString('pt-BR')} ${new Date(file.lastModified).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})} (Arq)`;
            }
            
            const la = EXIF.getTag(this, "GPSLatitude"); 
            const lr = EXIF.getTag(this, "GPSLatitudeRef");
            const lo = EXIF.getTag(this, "GPSLongitude"); 
            const or = EXIF.getTag(this, "GPSLongitudeRef");
            
            if(la && lo) { 
                const ld = dec(la, lr || 'S'); 
                const od = dec(lo, or || 'W'); 
                if(ld && od) gp = `${ld}, ${od}`; 
            }

            if(gp) {
                resolve({ horario: hr, gps: gp + ' (EXIF)' });
            } else if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    pos => resolve({ horario: hr, gps: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}` }), 
                    () => resolve({ horario: hr, gps: "Sem GPS" }), 
                    { enableHighAccuracy: true, timeout: 6000 }
                );
            } else {
                resolve({ horario: hr, gps: "GPS Indisponível" });
            }
        });
    });
}


// ==========================================
// MÓDULO: AUDITORIA E LOG (DEV)
// ==========================================
async function registrarLog(acao, resumo, pay = {}) {
    try { 
        await addDoc(collection(db, "logs_auditoria"), { 
            timestamp_id: Date.now(), 
            data_hora: getDataHoraNavegador(), 
            dia: obterDataString('HOJE'), 
            usuario: usuarioLogado || 'SISTEMA', 
            cargo: cargoLogado || 'N/A', 
            acao: acao, 
            resumo: resumo.toUpperCase(), 
            detalhes: pay 
        }); 
    } catch (e) {
        console.error("Erro no Log:", e);
    }
}

window.carregarLogsAuditoria = async function() {
    const c = document.getElementById('lista-logs-auditoria'); 
    if(c) c.innerHTML = '<div class="text-xs text-blue-700 font-black text-center py-4"><i class="fas fa-spinner fa-spin mr-1"></i> Baixando auditoria...</div>';
    
    try { 
        const sn = await getDocs(query(collection(db, "logs_auditoria"), orderBy("timestamp_id", "desc"), limit(150))); 
        logsAuditoria = []; 
        sn.forEach(d => logsAuditoria.push({ log_id: d.id, ...d.data() })); 
        window.filtrarLogsTela(); 
    } catch (e) {
        console.error(e);
        if(c) c.innerHTML = '<div class="text-xs text-red-600 font-bold text-center py-4">Erro ao baixar logs.</div>';
    }
};

window.filtrarLogsTela = function() {
    const c = document.getElementById('lista-logs-auditoria'); 
    if(!c) return;
    
    const tp = document.getElementById('filtro-tipo-log')?.value || 'TODOS'; 
    const bs = (document.getElementById('busca-log-input')?.value || '').trim().toUpperCase();
    
    c.innerHTML = '';
    const f = logsAuditoria.filter(l => (tp === 'TODOS' || l.acao === tp) && (!bs || `${l.resumo} ${l.usuario} ${l.cargo} ${l.acao}`.toUpperCase().includes(bs)));
    
    if(f.length === 0) {
        c.innerHTML = '<div class="text-xs text-gray-400 italic text-center py-4">Nenhum evento encontrado.</div>';
        return;
    }
    
    const bc = { 
        SAIDA_PLANO_B: 'bg-amber-100 text-amber-800 border-amber-400', 
        EXCLUSAO: 'bg-red-100 text-red-800 border-red-400', 
        EDICAO: 'bg-blue-100 text-blue-800 border-blue-400', 
        ENTRADA: 'bg-emerald-100 text-emerald-800 border-emerald-400', 
        SAIDA_PLANO_A: 'bg-teal-100 text-teal-800 border-teal-400', 
        LOGIN: 'bg-purple-100 text-purple-800 border-purple-400', 
        CONFIG: 'bg-gray-200 text-gray-800 border-gray-400' 
    };
    
    f.forEach(l => {
        const d = document.createElement('div'); 
        d.className = `p-2.5 rounded-xl border ${bc[l.acao] || bc.CONFIG} flex justify-between items-center cursor-pointer mb-2 hover:opacity-90`; 
        d.onclick = () => window.abrirDetalheLog(l.log_id);
        
        d.innerHTML = `
            <div class="pr-2">
                <div class="flex items-center space-x-2">
                    <span class="text-[9px] font-black uppercase px-1.5 py-0.5 bg-white/80 rounded">${l.acao}</span>
                    <span class="text-[10px] font-bold">${l.data_hora}</span>
                </div>
                <div class="font-black text-xs mt-1 uppercase">${l.resumo}</div>
                <div class="text-[10px] opacity-80 uppercase font-bold">Autor: ${l.usuario}</div>
            </div>
            <i class="fas fa-chevron-right text-sm opacity-60"></i>
        `;
        c.appendChild(d);
    });
};

window.abrirDetalheLog = function(id) {
    const l = logsAuditoria.find(i => i.log_id === id); 
    if(!l) return;
    
    document.getElementById('conteudo-detalhe-log').innerHTML = `
        <div class="bg-gray-100 p-3 rounded-xl border">
            <div class="font-black text-sm uppercase">${l.resumo}</div>
            <div class="text-[11px] text-gray-600 font-bold mt-1 uppercase">Ação: <span class="text-red-700">${l.acao}</span> | Data: ${l.data_hora}</div>
            <div class="text-[11px] text-gray-600 font-bold uppercase">Autor: ${l.usuario} (${l.cargo})</div>
        </div>
        <div>
            <span class="block text-[10px] font-black uppercase text-gray-500 mb-1">Carga JSON Original:</span>
            <pre class="bg-gray-900 text-green-400 p-3 rounded-xl text-[10px] overflow-x-auto font-mono">${JSON.stringify(l.detalhes || {}, null, 2)}</pre>
        </div>
    `;
    
    let rd = `<button onclick="window.fecharDetalheLog()" class="flex-1 bg-gray-200 text-gray-800 font-black py-3 rounded-xl text-xs">Fechar</button>`;
    
    if(l.acao === 'EXCLUSAO' && l.detalhes?.registro_apagado) {
        rd += `<button onclick="window.restaurarRegistro('${l.log_id}')" class="flex-1 bg-emerald-600 text-white font-black py-3 rounded-xl text-xs shadow"><i class="fas fa-undo"></i> Restaurar</button>`;
    }
    if(l.acao === 'EDICAO' && l.detalhes?.antes) {
        rd += `<button onclick="window.reverterEdicao('${l.log_id}')" class="flex-1 bg-amber-600 text-white font-black py-3 rounded-xl text-xs shadow"><i class="fas fa-history"></i> Reverter</button>`;
    }
    
    document.getElementById('rodape-detalhe-log').innerHTML = rd; 
    document.getElementById('modal-detalhe-log').classList.remove('hidden');
};

window.fecharDetalheLog = () => document.getElementById('modal-detalhe-log').classList.add('hidden');

window.restaurarRegistro = async function(id) {
    const l = logsAuditoria.find(i => i.log_id === id); 
    if(!l) return;
    
    if(await window.appConfirm("Restaurar Veículo", `Deseja recriar o registro da placa ${l.detalhes.registro_apagado.placa}?`, "Sim, Restaurar")) {
        try {
            const c = { ...l.detalhes.registro_apagado }; 
            delete c.firebase_id;
            
            await addDoc(collection(db, "registros"), c); 
            await registrarLog('CONFIG', `RESTAUROU A PLACA ${c.placa}`);
            
            window.fecharDetalheLog(); 
            window.mostrarToast(`Veículo ${c.placa} Restaurado!`, "sucesso");
        } catch (e) {
            window.appAlert("Erro", e.message, "erro");
        }
    }
};

window.reverterEdicao = async function(id) {
    const l = logsAuditoria.find(i => i.log_id === id); 
    if(!l) return;
    
    if(await window.appConfirm("Reverter Edição", `Deseja voltar os dados da placa ${l.detalhes.antes.placa} ao estado original?`, "Reverter")) {
        try {
            await updateDoc(doc(db, "registros", l.detalhes.firebase_id), { 
                placa: l.detalhes.antes.placa, 
                dados_dinamicos: l.detalhes.antes.dados_dinamicos 
            });
            await registrarLog('CONFIG', `REVERTEU EDIÇÃO DA PLACA ${l.detalhes.antes.placa}`); 
            
            window.fecharDetalheLog(); 
            window.mostrarToast("Edição revertida!", "sucesso");
        } catch (e) {
            window.appAlert("Erro", e.message, "erro");
        }
    }
};


// ==========================================
// MÓDULO: LOGIN, AUTENTICAÇÃO E CONEXÕES
// ==========================================
window.fazerLogin = async function() {
    const u = document.getElementById('login-usuario').value.trim().toUpperCase(); 
    const s = document.getElementById('login-senha').value; 
    const st = document.getElementById('login-status'); 
    const btn = document.getElementById('btn-login');
    
    if(!u || !s) {
        st.innerHTML = 'Preencha usuário e senha.';
        return;
    }
    
    st.innerHTML = '<i class="fas fa-spinner fa-spin text-blue-600"></i> Entrando...'; 
    btn.disabled = true;
    
    if(u === 'ADMIN' && s === SENHA_ADMIN) { 
        usuarioLogado = 'DEV / ADMIN'; 
        cargoLogado = 'DEV'; 
        isAdmin = true; 
        permissoesAtuais = permissoesAdminDev; 
        
        btn.disabled = false; 
        await registrarLog('LOGIN', 'LOGIN DEV'); 
        iniciarAplicativo(); 
        return; 
    }
    
    try {
        const sn = await getDocs(query(collection(db, "usuarios"), where("nome", "==", u), where("senha", "==", s), limit(1)));
        
        if(!sn.empty) { 
            const f = sn.docs[0].data(); 
            usuarioLogado = f.nome; 
            cargoLogado = f.cargo || 'OPERADOR'; 
            isAdmin = false; 
            permissoesAtuais = f.permissoes; 
            
            await registrarLog('LOGIN', `LOGIN: ${u}`); 
            iniciarAplicativo(); 
        } else {
            st.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Usuário ou Senha incorretos.';
        }
    } catch(e) { 
        st.innerHTML = '<i class="fas fa-times-circle"></i> Erro ao acessar o banco de dados.'; 
        console.error(e);
    } finally { 
        btn.disabled = false; 
    }
};

function iniciarConexoesPosLogin() {
    if(!unsubscribeSchema) {
        unsubscribeSchema = onSnapshot(doc(db, "configuracoes", "schema"), (ds) => { 
            if(ds.exists() && Array.isArray(ds.data().campos)) {
                schemaCampos = ds.data().campos; 
            } else if(isAdmin) {
                setDoc(doc(db, "configuracoes", "schema"), { campos: camposPadrao }).catch(() => {});
            }
            window.renderizarTudo(); 
        });
    }

    if(!unsubscribePatioAtivo) {
        unsubscribePatioAtivo = onSnapshot(query(collection(db, "registros"), where("saida", "==", "")), (sn) => { 
            registrosPatioAtivo = []; 
            sn.forEach(d => registrosPatioAtivo.push({ firebase_id: d.id, ...d.data() })); 
            registrosPatioAtivo.sort((a,b) => b.id - a.id); 
            
            window.filtrarListas(); 
            window.atualizarDashboard(); 
            document.getElementById('status-conexao').innerHTML = '<i class="fas fa-wifi text-green-400"></i>'; 
        }, () => {
            document.getElementById('status-conexao').innerHTML = '<i class="fas fa-exclamation-triangle text-red-400"></i>';
        });
    }

    if(isAdmin && !unsubscribeUsuarios) { 
        unsubscribeUsuarios = onSnapshot(collection(db, "usuarios"), (sn) => { 
            usuarios = []; 
            sn.forEach(d => usuarios.push({ id: d.id, ...d.data() })); 
            window.renderizarUsuarios(); 
        }); 
        window.carregarLogsAuditoria(); 
    }
}

function encerrarConexoes() {
    if(unsubscribePatioAtivo) { unsubscribePatioAtivo(); unsubscribePatioAtivo = null; }
    if(unsubscribeSchema) { unsubscribeSchema(); unsubscribeSchema = null; }
    if(unsubscribeUsuarios) { unsubscribeUsuarios(); unsubscribeUsuarios = null; }
    
    registrosPatioAtivo = []; 
    registrosHistorico = []; 
    logsAuditoria = [];
}

function iniciarAplicativo() {
    document.getElementById('view-login').classList.add('hidden'); 
    document.getElementById('app-header').classList.remove('hidden'); 
    document.getElementById('main-content').classList.remove('hidden'); 
    document.getElementById('bottom-nav').classList.remove('hidden');
    
    document.getElementById('nome-usuario-header').innerHTML = `<i class="fas fa-user-shield mr-1"></i>${usuarioLogado}`; 
    document.getElementById('cargo-usuario-header').innerText = cargoLogado;
    
    ['registro', 'patio', 'planilha'].forEach(t => {
        const tb = document.getElementById(`tab-${t}`);
        if(tb) tb.style.display = permissoesAtuais[t.substring(0, 3)] ? 'flex' : 'none';
    });
    
    const tc = document.getElementById('tab-config');
    if(tc) tc.style.display = isAdmin ? 'flex' : 'none'; 
    
    const bi = document.getElementById('btn-imprimir');
    if(bi) bi.style.display = permissoesAtuais.imp ? 'block' : 'none'; 
    
    const be = document.getElementById('btn-excluir-lote');
    if(be) be.style.display = permissoesAtuais.exc ? 'block' : 'none';
    
    iniciarConexoesPosLogin(); 
    window.renderizarTudo(); 
    window.mudarAba('dashboard');
}

window.solicitarLogoff = async function() {
    if(await window.appConfirm("Sair", "Encerrar sessão de trabalho?", "Sair Agora")) { 
        await registrarLog('LOGIN', `LOGOFF: ${usuarioLogado}`); 
        encerrarConexoes(); 
        document.location.reload(); 
    }
};

// ==========================================
// MÓDULO: ADMINISTRAÇÃO E CONSTRUTOR DE CAMPOS
// ==========================================
window.criarUsuario = async function() {
    const n = document.getElementById('novo-user-nome').value.trim().toUpperCase(); 
    const s = document.getElementById('novo-user-senha').value.trim(); 
    const c = document.getElementById('novo-user-cargo').value;
    
    if(!n || !s) return window.appAlert("Erro", "Nome e Senha são obrigatórios", "aviso"); 
    if(usuarios.find(u => u.nome === n) || n === 'ADMIN') return window.appAlert("Erro", "Este usuário já existe no sistema.", "erro");
    
    const p = { 
        reg: c.includes('SUPER') || c.includes('GER') || c.includes('PORT'), 
        pat: true, 
        sai: true, 
        pla: c.includes('CONFERENTE') || c.includes('SUPER') || c.includes('GER'), 
        imp: c.includes('SUPER') || c.includes('GER'), 
        edi: c.includes('SUPER') || c.includes('GER'), 
        exc: c.includes('GER') 
    };
    
    try {
        await addDoc(collection(db, "usuarios"), { nome: n, senha: s, cargo: c, permissoes: p }); 
        await registrarLog('CONFIG', `CRIOU USUÁRIO ${n}`); 
        document.getElementById('novo-user-nome').value = ''; 
        document.getElementById('novo-user-senha').value = ''; 
        window.mostrarToast("Usuário criado com sucesso!");
    } catch(e) {
        window.appAlert("Erro", e.message, "erro");
    }
};

window.excluirUsuario = async function(id, n) { 
    if(await window.appConfirm("Excluir", `Remover acesso do usuário ${n}?`, "Excluir", true)) { 
        await deleteDoc(doc(db, "usuarios", id)); 
        await registrarLog('CONFIG', `EXCLUIU USUÁRIO ${n}`); 
        window.mostrarToast("Usuário removido.", "aviso");
    } 
};

window.atualizarPermissao = async function(id, n, k, v) { 
    await updateDoc(doc(db, "usuarios", id), {[`permissoes.${k}`]: v}); 
    await registrarLog('CONFIG', `EDITOU PERMISSÃO DE ${n}`); 
};

window.atualizarCargoUsuario = async function(id, n, c) { 
    await updateDoc(doc(db, "usuarios", id), { cargo: c }); 
    await registrarLog('CONFIG', `EDITOU CARGO DE ${n} P/ ${c}`); 
};

window.renderizarUsuarios = function() {
    const c = document.getElementById('lista-usuarios-admin'); 
    if(!c) return; 
    
    if(usuarios.length === 0) {
        c.innerHTML = '<div class="italic text-gray-400 text-xs">Nenhum funcionário cadastrado.</div>';
        return;
    }
    
    c.innerHTML = '';
    usuarios.forEach(u => {
        const p = u.permissoes || {}; 
        const ca = u.cargo || 'OPERADOR';
        
        c.innerHTML += `
            <div class="bg-gray-50 border p-3 rounded-xl mb-3">
                <div class="flex justify-between border-b pb-2 mb-2">
                    <div>
                        <div class="font-black text-sm text-blue-900">${u.nome}</div>
                        <div class="text-[10px]">SENHA: ${u.senha}</div>
                    </div>
                    <button onclick="window.excluirUsuario('${u.id}', '${u.nome}')" class="text-red-500 hover:bg-red-100 p-2 rounded"><i class="fas fa-trash"></i></button>
                </div>
                <select onchange="window.atualizarCargoUsuario('${u.id}', '${u.nome}', this.value)" class="w-full border p-2 rounded-lg text-xs font-bold bg-white mb-2 uppercase shadow-sm">
                    <option ${ca === 'PORTEIRO / OPERADOR' ? 'selected' : ''}>PORTEIRO / OPERADOR</option>
                    <option ${ca === 'CONFERENTE DE PÁTIO' ? 'selected' : ''}>CONFERENTE DE PÁTIO</option>
                    <option ${ca === 'SUPERVISOR LOGÍSTICO' ? 'selected' : ''}>SUPERVISOR LOGÍSTICO</option>
                    <option ${ca === 'GERENTE OPERACIONAL' ? 'selected' : ''}>GERENTE OPERACIONAL</option>
                </select>
                <div class="grid grid-cols-2 gap-2 text-xs">
                    <label class="flex items-center space-x-1"><input type="checkbox" onchange="window.atualizarPermissao('${u.id}','${u.nome}','reg',this.checked)" ${p.reg ? 'checked' : ''} class="w-4 h-4 rounded"><span>Criar Entradas</span></label>
                    <label class="flex items-center space-x-1"><input type="checkbox" onchange="window.atualizarPermissao('${u.id}','${u.nome}','pat',this.checked)" ${p.pat ? 'checked' : ''} class="w-4 h-4 rounded"><span>Ver Pátio</span></label>
                    <label class="flex items-center space-x-1"><input type="checkbox" onchange="window.atualizarPermissao('${u.id}','${u.nome}','sai',this.checked)" ${p.sai ? 'checked' : ''} class="w-4 h-4 rounded"><span class="text-red-600 font-bold">Dar Saídas</span></label>
                    <label class="flex items-center space-x-1"><input type="checkbox" onchange="window.atualizarPermissao('${u.id}','${u.nome}','pla',this.checked)" ${p.pla ? 'checked' : ''} class="w-4 h-4 rounded"><span>Histórico</span></label>
                    <label class="flex items-center space-x-1"><input type="checkbox" onchange="window.atualizarPermissao('${u.id}','${u.nome}','imp',this.checked)" ${p.imp ? 'checked' : ''} class="w-4 h-4 rounded"><span>Imprimir PDF</span></label>
                    <label class="flex items-center space-x-1"><input type="checkbox" onchange="window.atualizarPermissao('${u.id}','${u.nome}','edi',this.checked)" ${p.edi ? 'checked' : ''} class="w-4 h-4 rounded"><span class="text-blue-600 font-bold">Editar Dados</span></label>
                    <label class="flex items-center space-x-1"><input type="checkbox" onchange="window.atualizarPermissao('${u.id}','${u.nome}','exc',this.checked)" ${p.exc ? 'checked' : ''} class="w-4 h-4 rounded"><span class="text-red-600 font-bold">Excluir Dados</span></label>
                </div>
            </div>`;
    });
};

window.adicionarCampo = async function() { 
    const n = document.getElementById('novo-campo-nome').value.trim().toUpperCase(); 
    const t = document.getElementById('novo-campo-tipo').value; 
    
    if(!n) return window.appAlert("Aviso", "Digite o nome do campo.", "aviso");
    
    schemaCampos.push({ id: "c_" + Date.now(), nome: n, tipo: t, fixo: false }); 
    document.getElementById('novo-campo-nome').value = ''; 
    
    try {
        await setDoc(doc(db, "configuracoes", "schema"), { campos: schemaCampos }); 
        await registrarLog('CONFIG', `CRIOU CAMPO ${n}`); 
        window.mostrarToast("Campo criado!");
    } catch(e) {
        window.appAlert("Erro", "Falha ao criar campo na nuvem.", "erro");
    }
};

window.excluirCampo = async function(i) { 
    if(await window.appConfirm("Excluir", `Apagar definitivamente o campo ${schemaCampos[i].nome}?`)) { 
        schemaCampos.splice(i, 1); 
        await setDoc(doc(db, "configuracoes", "schema"), { campos: schemaCampos }); 
    } 
};

window.moverCampo = async function(i, d) { 
    const nx = i + d; 
    if(nx >= 0 && nx < schemaCampos.length) { 
        const t = schemaCampos[i]; 
        schemaCampos[i] = schemaCampos[nx]; 
        schemaCampos[nx] = t; 
        await setDoc(doc(db, "configuracoes", "schema"), { campos: schemaCampos }); 
    } 
};

window.gerarBackupNuvem = async function() { 
    const btn = document.getElementById('btn-backup-nuvem'); 
    btn.innerHTML = '<i class="fas fa-spin fa-spinner"></i> Baixando...'; 
    btn.disabled = true;
    
    try { 
        const sn = await getDocs(query(collection(db, "registros"))); 
        const td = []; 
        sn.forEach(d => td.push(d.data())); 
        
        if(td.length === 0) return window.appAlert("Vazio", "Banco sem registros.", "aviso"); 
        
        const a = document.createElement('a'); 
        a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(td, null, 2)); 
        a.download = `patiopark_bkp_${Date.now()}.json`; 
        a.click(); 
        
        await registrarLog('CONFIG', 'GEROU BACKUP JSON COMPLETO'); 
        window.mostrarToast("Backup salvo no seu computador!");
    } catch(e) {
        window.appAlert("Erro", "Falha ao gerar backup.", "erro");
    } finally { 
        btn.innerHTML = 'Baixar Backup JSON'; 
        btn.disabled = false;
    } 
};


// ==========================================
// MÓDULO: RENDERIZAÇÃO CENTRAL DA INTERFACE
// ==========================================
window.mudarAba = function(aba) {
    ['dashboard', 'registro', 'patio', 'planilha', 'config'].forEach(a => { 
        const view = document.getElementById('view-' + a);
        if(view) view.classList.add('hidden'); 
        
        const tab = document.getElementById('tab-' + a);
        if(tab) {
            tab.classList.remove('text-blue-600', 'text-red-600');
            tab.classList.add('text-gray-400');
        }
    });
    
    const viewAtiva = document.getElementById(`view-${aba}`);
    if(viewAtiva) viewAtiva.classList.remove('hidden'); 
    
    const tabAtiva = document.getElementById(`tab-${aba}`); 
    if(tabAtiva) { 
        tabAtiva.classList.remove('text-gray-400'); 
        tabAtiva.classList.add(aba === 'config' ? 'text-red-600' : 'text-blue-600'); 
    }
    
    if(aba === 'dashboard') window.atualizarDashboard(); 
    if(aba === 'planilha' && registrosHistorico.length === 0) window.carregarHistorico(true);
};

window.limparCampo = (id) => { 
    const i = document.getElementById(id); 
    if(i) { i.value = ''; i.focus(); } 
};

window.verificarModeloOutros = (v, id) => { 
    const o = document.getElementById('campo_' + id + '_obs'); 
    if(o) { 
        if(v === 'OUTROS') { 
            o.classList.remove('hidden'); 
            o.focus(); 
        } else { 
            o.classList.add('hidden'); 
            o.value = ''; 
        } 
    } 
};

window.renderizarTudo = function() {
    const f = document.getElementById('formulario-dinamico');
    if(f) {
        const vA = {}; 
        schemaCampos.forEach(c => { 
            const el = document.getElementById('campo_' + c.id); 
            if(el) vA[c.id] = el.value; 
        }); 
        
        f.innerHTML = '';
        
        schemaCampos.forEach((c, i) => {
            let h = '';
            if(c.tipo === 'placa') {
                h = `
                <div class="mb-4">
                    <label class="block text-sm font-bold uppercase">${i+1}. ${c.nome} (Foto Entrada)</label>
                    <div class="relative flex items-center mt-1 no-print">
                        <input type="text" id="campo_${c.id}" class="w-full border-2 border-gray-300 p-3 pr-24 rounded-xl uppercase font-bold" onblur="window.verificarHistorico(this.value)" placeholder="ABC-1234">
                        <div class="absolute right-2 top-1/2 -translate-y-1/2 flex space-x-1">
                            <label class="bg-blue-100 text-blue-600 rounded-lg w-10 h-10 flex items-center justify-center shadow-sm cursor-pointer hover:bg-blue-200 transition">
                                <i class="fas fa-camera"></i>
                                <input type="file" accept="image/*" capture="environment" class="hidden" onchange="window.processarFotoPlaca(event)">
                            </label>
                            <label class="bg-purple-100 text-purple-600 rounded-lg w-10 h-10 flex items-center justify-center shadow-sm cursor-pointer hover:bg-purple-200 transition">
                                <i class="fas fa-image"></i>
                                <input type="file" accept="image/*" class="hidden" onchange="window.processarFotoPlaca(event)">
                            </label>
                        </div>
                    </div>
                    <div id="preview-container" class="hidden mt-2 p-2 border-2 border-blue-200 rounded-xl bg-blue-50 flex items-center justify-between">
                        <img id="preview-img" class="h-16 w-16 object-cover rounded-lg border border-blue-300">
                        <div id="preview-info" class="text-[10px] font-bold text-right ml-2 leading-tight"></div>
                    </div>
                    <div id="status_foto_completo" class="text-xs font-bold text-orange-600 mt-1 hidden"><i class="fas fa-spin fa-spinner"></i> Processando Imagem...</div>
                    <div id="alerta_historico_completo" class="hidden bg-blue-50 border-l-4 border-blue-500 p-3 mt-2 rounded-r-xl shadow-sm">
                        <div class="flex justify-between items-center">
                            <div>
                                <h3 class="font-bold text-xs uppercase text-blue-800">Conhecido</h3>
                                <p id="texto_historico_completo" class="text-[10px] text-blue-600 uppercase"></p>
                            </div>
                            <button type="button" onclick="window.aplicarAutopreenchimento()" class="bg-blue-600 hover:bg-blue-700 text-white text-[10px] px-3 py-2 rounded-lg font-bold shadow uppercase transition">Autopreencher</button>
                        </div>
                    </div>
                </div>`;
            } 
            else if(c.tipo === 'select_modelo') {
                h = `
                <div class="mb-4">
                    <label class="block text-sm font-bold uppercase">${i+1}. ${c.nome}</label>
                    <select id="campo_${c.id}" onchange="window.verificarModeloOutros(this.value, '${c.id}')" class="w-full border-2 border-gray-300 p-3 rounded-xl uppercase font-bold">
                        <option value="" disabled selected>SELECIONE...</option>
                        <option value="CAMINHÃO">CAMINHÃO</option>
                        <option value="PICAPE">PICAPE</option>
                        <option value="MOTO">MOTO</option>
                        <option value="CARRO DE PASSEIO">CARRO DE PASSEIO</option>
                        <option value="OUTROS">OUTROS</option>
                    </select>
                    <input type="text" id="campo_${c.id}_obs" class="hidden w-full border-2 border-blue-300 p-3 rounded-xl uppercase font-bold mt-2" placeholder="DIGITE O MODELO EXATO">
                </div>`;
            } 
            else if(c.tipo === 'textarea') {
                h = `
                <div class="mb-4">
                    <label class="block text-sm font-bold uppercase">${i+1}. ${c.nome}</label>
                    <textarea id="campo_${c.id}" rows="3" class="w-full border-2 border-gray-300 p-3 rounded-xl uppercase font-bold mt-1"></textarea>
                    <div class="text-right mt-1">
                        <button tabindex="-1" onclick="window.limparCampo('campo_${c.id}')" class="text-red-400 text-xs font-bold uppercase hover:text-red-600 transition"><i class="fas fa-eraser"></i> Limpar</button>
                    </div>
                </div>`;
            } 
            else {
                h = `
                <div class="mb-4">
                    <label class="block text-sm font-bold uppercase">${i+1}. ${c.nome}</label>
                    <div class="relative flex items-center mt-1">
                        <input type="text" id="campo_${c.id}" class="w-full border-2 border-gray-300 p-3 pr-10 rounded-xl uppercase font-bold">
                        <button tabindex="-1" onclick="window.limparCampo('campo_${c.id}')" class="absolute right-3 text-red-400 hover:text-red-600 transition text-xl"><i class="fas fa-times-circle"></i></button>
                    </div>
                </div>`;
            }
            f.insertAdjacentHTML('beforeend', h);
        });

        // Restaura valores após recriar os campos
        schemaCampos.forEach(c => { 
            const el = document.getElementById('campo_' + c.id); 
            if(el && vA[c.id]) el.value = vA[c.id]; 
        });
    }

    // Cabecalho Planilha
    const cp = document.getElementById('cabecalho-planilha');
    if(cp) {
        let thead = `<th class="px-3 py-2 border-r w-10 no-print ${permissoesAtuais.exc ? '' : 'hidden'}"><i class="fas fa-check-square"></i></th>`;
        thead += `<th class="px-3 py-2 border-r no-print ${permissoesAtuais.edi || permissoesAtuais.exc || permissoesAtuais.sai ? '' : 'hidden'}">Ações</th>`;
        thead += `<th class="px-3 py-2 border-r no-print">Fotos</th>`;
        thead += `<th class="px-3 py-2 border-r">Entrada</th>`;
        thead += `<th class="px-3 py-2 border-r">Saída</th>`;
        thead += `<th class="px-3 py-2 border-r">Op.</th>`;
        
        schemaCampos.forEach(c => { 
            thead += `<th class="px-3 py-2 border-r">${c.tipo === 'placa' ? 'PLACA' : c.nome}</th>`; 
        });
        
        thead += `<th class="px-3 py-2 border-r no-print">GPS</th>`;
        thead += `<th class="px-3 py-2 no-print">Met. Saída</th>`;
        cp.innerHTML = thead;
    }

    // Admin Construtor de Campos
    const lc = document.getElementById('lista-campos-admin');
    if(lc && isAdmin) {
        lc.innerHTML = '';
        schemaCampos.forEach((c, i) => {
            lc.innerHTML += `
            <div class="flex items-center justify-between bg-gray-50 border p-2 rounded-lg mb-2">
                <div class="flex flex-col text-xs space-y-1">
                    <button onclick="window.moverCampo(${i}, -1)" ${i === 0 ? 'disabled' : ''} class="text-gray-400 hover:text-blue-600 disabled:opacity-30"><i class="fas fa-chevron-up"></i></button>
                    <button onclick="window.moverCampo(${i}, 1)" ${i === schemaCampos.length-1 ? 'disabled' : ''} class="text-gray-400 hover:text-blue-600 disabled:opacity-30"><i class="fas fa-chevron-down"></i></button>
                </div>
                <div class="flex-1 px-3">
                    <div class="font-bold text-sm uppercase">${c.nome}</div>
                    <div class="text-[10px] text-gray-500 uppercase">${c.tipo}</div>
                </div>
                ${!c.fixo ? `<button onclick="window.excluirCampo(${i})" class="text-red-500 hover:bg-red-100 p-2 rounded transition"><i class="fas fa-trash"></i></button>` : '<span class="text-gray-400 text-xs px-2"><i class="fas fa-lock"></i></span>'}
            </div>`;
        });
    }
    
    window.filtrarListas();
};


// ==========================================
// MÓDULO: FLUXO DE ENTRADA (FOTOS E DADOS)
// ==========================================
window.processarFotoPlaca = async function(ev) {
    const file = ev.target.files[0]; 
    if(!file) return;
    
    const sl = document.getElementById('status_foto_completo');
    const pc = document.getElementById('preview-container');
    const pi = document.getElementById('preview-img');
    const pinfo = document.getElementById('preview-info');
    
    sl.classList.remove('hidden'); 
    sl.innerHTML = '<i class="fas fa-spin fa-spinner"></i> Extraindo Metadados...';
    
    const m = await extrairMetadadosFoto(file); 
    dataHoraMetadata = m.horario; 
    gpsLocalizacao = m.gps;
    
    const r = new FileReader();
    r.onload = function(e) {
        const img = new Image(); 
        img.onload = async function() {
            sl.innerHTML = '<i class="fas fa-spin fa-spinner"></i> Comprimindo WebP...';
            
            const cv = document.createElement('canvas'); 
            const scale = 800 / img.width; 
            cv.width = 800; 
            cv.height = img.height * scale; 
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            
            const wbp = cv.toDataURL('image/webp', 0.8);
            pi.src = wbp; 
            pc.classList.remove('hidden'); 
            pinfo.innerHTML = `${dataHoraMetadata}<br>${gpsLocalizacao}<br><span class="text-blue-500 font-black"><i class="fas fa-cloud-upload-alt"></i> Subindo Nuvem...</span>`;
            
            try {
                const fd = new FormData(); 
                fd.append("image", wbp.split(',')[1]);
                
                const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: fd }); 
                const j = await res.json();
                
                if(j.success) { 
                    fotoAtualUrl = j.data.url; 
                    sl.innerHTML = `<i class="fas fa-check-circle text-green-600"></i> Autenticado.`;
                    pinfo.innerHTML = `${dataHoraMetadata}<br>${gpsLocalizacao}<br><span class="text-green-600 font-black">IMGBB OK</span>`; 
                } else {
                    throw new Error();
                }
            } catch(er) { 
                fotoAtualUrl = null; 
                sl.innerHTML = `<i class="fas fa-exclamation-triangle text-red-600"></i> Erro Upload.`; 
                pinfo.innerHTML = `${dataHoraMetadata}<br><span class="text-red-600 font-black">FALHA REDE</span>`; 
            }
        }; 
        img.src = e.target.result;
    };
    r.readAsDataURL(file);
};

window.verificarHistorico = async function(p) {
    const pl = p.trim().toUpperCase(); 
    if(pl.length < 7) return document.getElementById('alerta_historico_completo')?.classList.add('hidden');
    
    try {
        const sn = await getDocs(query(collection(db, "registros"), where("placa", "==", pl))); 
        const h = []; 
        sn.forEach(d => h.push({ firebase_id: d.id, ...d.data() })); 
        h.sort((a,b) => b.id - a.id);
        
        if(h.length > 0) { 
            window._veiculo_temp = h[0]; 
            document.getElementById('alerta_historico_completo').classList.remove('hidden'); 
            document.getElementById('texto_historico_completo').innerHTML = `Visitas: ${h.length}<br>Última: ${h[0].entrada.split(' ')[0]}`; 
        } else {
            document.getElementById('alerta_historico_completo')?.classList.add('hidden');
        }
    } catch(e) {
        console.error(e);
    }
};

window.aplicarAutopreenchimento = function() {
    if(!window._veiculo_temp) return;
    
    schemaCampos.forEach(c => {
        const i = document.getElementById('campo_' + c.id);
        if(i && c.id !== 'placa') {
            const v = window._veiculo_temp.dados_dinamicos?.[c.id] || '';
            if(c.tipo === 'select_modelo') { 
                const opts = Array.from(i.options).map(o => o.value); 
                if(opts.includes(v)) { 
                    i.value = v; 
                    window.verificarModeloOutros(v, c.id); 
                } else { 
                    i.value = 'OUTROS'; 
                    window.verificarModeloOutros('OUTROS', c.id); 
                    const obs = document.getElementById('campo_' + c.id + '_obs');
                    if(obs) obs.value = v; 
                } 
            } else {
                i.value = v;
            }
        }
    });
    
    document.getElementById('alerta_historico_completo').classList.add('hidden'); 
    window.mostrarToast("Dados autopreenchidos com sucesso!");
};

window.salvarRegistro = async function() {
    const btn = document.getElementById('btn-salvar-entrada'); 
    btn.innerHTML = '<i class="fas fa-spin fa-spinner"></i> Processando...'; 
    btn.disabled = true; 
    
    const d = {}; 
    let pl = '';
    
    schemaCampos.forEach(c => {
        const i = document.getElementById('campo_' + c.id);
        if(i) {
            let v = i.value.trim().toUpperCase();
            if(c.tipo === 'select_modelo' && v === 'OUTROS') {
                const obs = document.getElementById('campo_' + c.id + '_obs');
                v = obs ? obs.value.trim().toUpperCase() || 'OUTROS' : 'OUTROS';
            }
            if(c.id === 'placa') pl = v; 
            d[c.id] = v;
        }
    });
    
    if(!pl) { 
        btn.innerHTML = 'SALVAR ENTRADA'; 
        btn.disabled = false; 
        return window.appAlert("Erro", "A placa do veículo é obrigatória.", "aviso"); 
    }
    
    const ent = dataHoraMetadata || getDataHoraNavegador() + " (Sist)";
    const nv = { 
        id: Date.now(), 
        placa: pl, 
        entrada: ent, 
        dia_particao: ent.substring(0, 10), 
        saida: '', 
        visto_entrada: usuarioLogado, 
        visto_saida: '', 
        foto: fotoAtualUrl || '', 
        foto_saida: '', 
        metodo_saida: '', 
        motivo_plano_b: '', 
        gps: gpsLocalizacao || 'Sem GPS', 
        gps_saida: '', 
        dados_dinamicos: d 
    };
    
    try {
        const dr = await addDoc(collection(db, "registros"), nv); 
        await registrarLog('ENTRADA', `ENTROU: ${pl}`, { firebase_id: dr.id, registro: nv });
        
        schemaCampos.forEach(c => { 
            const i = document.getElementById('campo_' + c.id); 
            if(i) i.value = ''; 
            if(c.tipo === 'select_modelo') { 
                const o = document.getElementById('campo_' + c.id + '_obs'); 
                if(o) { o.value = ''; o.classList.add('hidden'); } 
            } 
        });
        
        fotoAtualUrl = null; 
        dataHoraMetadata = null; 
        gpsLocalizacao = null; 
        
        document.getElementById('preview-container').classList.add('hidden'); 
        document.getElementById('status_foto_completo').classList.add('hidden'); 
        document.getElementById('alerta_historico_completo').classList.add('hidden');
        
        window.mostrarToast(`Entrada da placa ${pl} OK!`); 
        window.mudarAba('patio');
    } catch(e) { 
        window.appAlert("Erro ao Salvar", e.message, "erro"); 
    } finally { 
        btn.innerHTML = 'SALVAR ENTRADA'; 
        btn.disabled = false; 
    }
};


// ==========================================
// MÓDULO: FLUXO DE SAÍDA E CONTINGÊNCIA
// ==========================================
window.abrirModalSaida = function(id) {
    document.getElementById('modal-detalhes').classList.add('hidden'); 
    
    if(!permissoesAtuais.sai) return; 
    const v = obterUnificada().find(r => r.firebase_id === id); 
    if(!v) return;
    
    registroSelecionadoFirebaseId = id; 
    fotoSaidaUrl = null; 
    dataHoraSaidaMetadata = null; 
    gpsSaidaLocalizacao = null;
    
    document.getElementById('saida-placa-alvo').innerText = `VEÍCULO: ${v.placa}`; 
    document.getElementById('input-placa-plano-b').value = ''; 
    document.getElementById('preview-saida-container').classList.add('hidden'); 
    document.getElementById('status-foto-saida').classList.add('hidden');
    
    window.alternarModoSaida('A'); 
    document.getElementById('modal-saida').classList.remove('hidden');
};

window.fecharModalSaida = () => document.getElementById('modal-saida').classList.add('hidden');

window.alternarModoSaida = function(m) {
    modoSaidaAtual = m;
    const btnA = document.getElementById('tab-saida-plano-a');
    const btnB = document.getElementById('tab-saida-plano-b');
    const boxA = document.getElementById('box-saida-plano-a');
    const boxB = document.getElementById('box-saida-plano-b');
    
    if(m === 'A') {
        btnA.className = "py-2 rounded-lg font-black text-xs uppercase bg-blue-600 text-white shadow transition";
        btnB.className = "py-2 rounded-lg font-black text-xs uppercase text-gray-600 hover:text-gray-900 transition";
        boxA.classList.remove('hidden');
        boxB.classList.add('hidden');
    } else {
        btnB.className = "py-2 rounded-lg font-black text-xs uppercase bg-amber-500 text-white shadow transition";
        btnA.className = "py-2 rounded-lg font-black text-xs uppercase text-gray-600 hover:text-gray-900 transition";
        boxB.classList.remove('hidden');
        boxA.classList.add('hidden');
        setTimeout(() => document.getElementById('input-placa-plano-b').focus(), 100);
    }
};

window.processarFotoSaida = async function(ev) {
    const file = ev.target.files[0]; 
    if(!file) return;
    
    document.getElementById('status-foto-saida').classList.remove('hidden'); 
    document.getElementById('status-foto-saida').innerHTML = '<i class="fas fa-spin fa-spinner"></i> Extraindo Metadados...'; 
    document.getElementById('preview-saida-container').classList.remove('hidden');
    
    const m = await extrairMetadadosFoto(file); 
    dataHoraSaidaMetadata = m.horario; 
    gpsSaidaLocalizacao = m.gps;
    
    document.getElementById('saida-meta-horario').innerText = dataHoraSaidaMetadata; 
    document.getElementById('saida-meta-gps').innerText = gpsSaidaLocalizacao;
    
    const r = new FileReader();
    r.onload = function(e) {
        const img = new Image();
        img.onload = async function() {
            document.getElementById('saida-meta-cloud').innerText = "Processando..."; 
            
            const cv = document.createElement('canvas'); 
            const sc = 800 / img.width; 
            cv.width = 800; 
            cv.height = img.height * sc; 
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            
            const wb = cv.toDataURL('image/webp', 0.8); 
            document.getElementById('preview-saida-img').src = wb;
            
            try {
                const fd = new FormData(); 
                fd.append("image", wb.split(',')[1]); 
                const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: fd }); 
                const j = await res.json();
                
                if(j.success) { 
                    fotoSaidaUrl = j.data.url; 
                    document.getElementById('saida-meta-cloud').innerHTML = '<span class="text-emerald-700 font-bold">IMGBB OK</span>'; 
                    document.getElementById('status-foto-saida').innerHTML = '<i class="fas fa-check-circle text-emerald-600"></i> Autenticado.'; 
                } else {
                    throw new Error();
                }
            } catch(er) { 
                fotoSaidaUrl = null; 
                document.getElementById('saida-meta-cloud').innerHTML = '<span class="text-red-600 font-bold">ERRO NA REDE</span>'; 
                document.getElementById('status-foto-saida').innerHTML = 'Falha no Upload da Foto.'; 
            }
        }; 
        img.src = e.target.result;
    }; 
    r.readAsDataURL(file);
};

window.confirmarSaida = async function() {
    const v = obterUnificada().find(r => r.firebase_id === registroSelecionadoFirebaseId); 
    if(!v) return;
    
    let hs = '', ms = '', mp = '', gs = '';
    
    if(modoSaidaAtual === 'A') {
        if(!fotoSaidaUrl) return window.appAlert("Foto Necessária", "Tire a foto de saída para validar ou alterne para o Plano B (Manual).", "aviso");
        hs = dataHoraSaidaMetadata || getDataHoraNavegador() + " (Sist)"; 
        gs = gpsSaidaLocalizacao || 'Sem GPS'; 
        ms = 'PLANO_A';
    } else {
        const pd = document.getElementById('input-placa-plano-b').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); 
        const ps = (v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        
        if(!pd || pd !== ps) return window.appAlert("Placa Incorreta", `Digite corretamente a placa do veículo cadastrado: ${v.placa}`, "erro");
        
        hs = getDataHoraNavegador() + " (Sist/Plano B)"; 
        gs = gpsSaidaLocalizacao || 'Plano B'; 
        ms = 'PLANO_B'; 
        mp = document.getElementById('motivo-plano-b').value;
    }
    
    const b = document.getElementById('btn-confirmar-saida'); 
    b.innerHTML = '<i class="fas fa-spin fa-spinner"></i> Processando...'; 
    b.disabled = true;
    
    try {
        const p = { 
            saida: hs, 
            visto_saida: usuarioLogado, 
            foto_saida: fotoSaidaUrl || '', 
            gps_saida: gs, 
            metodo_saida: ms, 
            motivo_plano_b: mp 
        };
        
        await updateDoc(doc(db, "registros", registroSelecionadoFirebaseId), p); 
        await registrarLog(ms === 'PLANO_A' ? 'SAIDA_PLANO_A' : 'SAIDA_PLANO_B', `SAIU: ${v.placa}`, { firebase_id: registroSelecionadoFirebaseId, dados_saida: p });
        
        const at = { ...v, ...p }; 
        const i = registrosHistorico.findIndex(x => x.firebase_id === registroSelecionadoFirebaseId); 
        if(i !== -1) registrosHistorico[i] = at; else registrosHistorico.unshift(at);
        
        window.fecharModalSaida(); 
        window.filtrarListas(); 
        window.atualizarDashboard(); 
        window.mostrarToast(`Saída de ${v.placa} Registrada!`, ms === 'PLANO_A' ? 'sucesso' : 'aviso');
    } catch(e) { 
        window.appAlert("Erro", e.message, "erro"); 
    } finally { 
        b.innerHTML = 'Confirmar Saída'; 
        b.disabled = false; 
    }
};


// ==========================================
// MÓDULO: EXCLUSÃO E EDIÇÃO DE DADOS
// ==========================================
window.abrirEdicao = function(id) {
    if(!permissoesAtuais.edi) return; 
    
    const r = obterUnificada().find(x => x.firebase_id === id); 
    if(!r) return; 
    
    registroSelecionadoFirebaseId = id;
    const c = document.getElementById('formulario-edicao'); 
    c.innerHTML = `<div class="mb-3"><label class="text-xs font-bold text-gray-500">PLACA</label><input type="text" id="edit_placa" value="${r.placa}" class="w-full border-2 border-blue-400 p-2.5 rounded-xl uppercase font-black text-blue-900 shadow-sm"></div>`;
    
    schemaCampos.forEach(sc => {
        if(sc.tipo !== 'placa') {
            if(sc.tipo === 'textarea') {
                c.innerHTML += `<div class="mb-3"><label class="text-xs font-bold text-gray-500">${sc.nome.toUpperCase()}</label><textarea id="edit_${sc.id}" class="w-full border p-2.5 rounded-xl uppercase shadow-sm">${r.dados_dinamicos?.[sc.id] || ''}</textarea></div>`;
            } else {
                c.innerHTML += `<div class="mb-3"><label class="text-xs font-bold text-gray-500">${sc.nome.toUpperCase()}</label><input type="text" id="edit_${sc.id}" value="${r.dados_dinamicos?.[sc.id] || ''}" class="w-full border p-2.5 rounded-xl uppercase shadow-sm"></div>`;
            }
        }
    });
    
    document.getElementById('modal-edicao').classList.remove('hidden');
};

window.fecharEdicao = () => { 
    document.getElementById('modal-edicao').classList.add('hidden'); 
    registroSelecionadoFirebaseId = null; 
};

window.salvarEdicao = async function() {
    const btn = document.getElementById('btn-salvar-edicao'); 
    btn.innerHTML = 'Salvando...'; 
    btn.disabled = true;
    
    const r = obterUnificada().find(x => x.firebase_id === registroSelecionadoFirebaseId); 
    const ant = { placa: r.placa, dados_dinamicos: { ...(r.dados_dinamicos || {}) } };
    const nv = { ...r.dados_dinamicos }; 
    
    schemaCampos.forEach(c => { 
        if(c.tipo !== 'placa') nv[c.id] = document.getElementById('edit_' + c.id).value.trim().toUpperCase(); 
    }); 
    
    const nP = document.getElementById('edit_placa').value.trim().toUpperCase();

    try {
        await updateDoc(doc(db, "registros", registroSelecionadoFirebaseId), { placa: nP, dados_dinamicos: nv });
        await registrarLog('EDICAO', `EDITOU PLACA ${ant.placa} -> ${nP}`, { firebase_id: registroSelecionadoFirebaseId, antes: ant, depois: { placa: nP, dados_dinamicos: nv } });
        
        const i = registrosHistorico.findIndex(x => x.firebase_id === registroSelecionadoFirebaseId);
        if(i !== -1) { 
            registrosHistorico[i].placa = nP; 
            registrosHistorico[i].dados_dinamicos = nv; 
        }
        
        window.filtrarListas(); 
        window.fecharEdicao(); 
        window.mostrarToast("Edição salva no sistema!", "sucesso");
    } catch(e) { 
        window.appAlert("Erro", e.message, "erro"); 
    } finally { 
        btn.innerHTML = 'Salvar Alterações'; 
        btn.disabled = false; 
    }
};

window.excluirIndiv = async function(id) {
    if(!permissoesAtuais.exc) return; 
    const a = obterUnificada().find(r => r.firebase_id === id); 
    if(!a) return;
    
    if(await window.appConfirm("Excluir Veículo", `Deseja realmente apagar o registro da placa ${a.placa}?`, "Sim, Excluir", true)) {
        try { 
            await deleteDoc(doc(db, "registros", id)); 
            await registrarLog('EXCLUSAO', `EXCLUIU: ${a.placa}`, { registro_apagado: a }); 
            registrosHistorico = registrosHistorico.filter(r => r.firebase_id !== id); 
            window.filtrarListas(); 
            window.mostrarToast(`Registro excluído com sucesso.`, 'aviso'); 
        } catch(e) {
            window.appAlert("Erro", "Falha ao apagar.", "erro");
        }
    }
};

window.excluirEmLote = async function() {
    if(!permissoesAtuais.exc) return; 
    const m = document.querySelectorAll('.cb-planilha:checked'); 
    
    if(m.length === 0) return window.appAlert("Aviso", "Selecione pelo menos um registro na tabela.", "aviso");
    
    if(await window.appConfirm("Apagar em Lote", `Confirma a exclusão de ${m.length} registros selecionados?`, "Apagar Lote", true)) {
        for(let cb of m) { 
            try { 
                const a = obterUnificada().find(r => r.firebase_id === cb.value); 
                await deleteDoc(doc(db, "registros", cb.value)); 
                if(a) await registrarLog('EXCLUSAO', `LOTE: EXCLUIU PLACA ${a.placa}`, { registro_apagado: a }); 
                registrosHistorico = registrosHistorico.filter(r => r.firebase_id !== cb.value); 
            } catch(e) {} 
        } 
        window.filtrarListas(); 
        window.mostrarToast("Registros apagados em lote.", "aviso");
    }
};


// ==========================================
// MÓDULO: RENDERIZAÇÃO DE LISTAS E PESQUISA
// ==========================================
window.imprimirRelatorio = function() { 
    document.getElementById('data-impressao').innerText = `Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} por ${usuarioLogado}`; 
    window.print(); 
};

window.verificarFiltroData = function(origem) { 
    const s = document.getElementById(`filtro-data-${origem}`); 
    const i = document.getElementById(`data-especifica-${origem}`); 
    if(s.value === 'ESPECIFICA') i.classList.remove('hidden'); 
    else i.classList.add('hidden'); 
    
    if(origem === 'planilha') window.carregarHistorico(true); 
    else window.mudarFiltroPatio(); 
};

window.mudarFiltroPatio = async function() {
    const st = document.getElementById('filtro-status-patio').value; 
    const ds = document.getElementById('filtro-data-patio').value; 
    const de = document.getElementById('data-especifica-patio').value;
    
    if(st !== 'NO_PATIO') {
        let q = null;
        if(ds === 'HOJE') q = query(collection(db, "registros"), where("dia_particao", "==", obterDataString('HOJE')));
        else if(ds === 'ONTEM') q = query(collection(db, "registros"), where("dia_particao", "==", obterDataString('ONTEM')));
        else if(ds === 'ESPECIFICA' && de) { 
            const e = de.split('-'); 
            q = query(collection(db, "registros"), where("dia_particao", "==", `${e[2]}/${e[1]}/${e[0]}`)); 
        }
        else q = query(collection(db, "registros"), orderBy("id", "desc"), limit(50));
        
        const sn = await getDocs(q); 
        registrosHistorico = []; 
        sn.forEach(d => registrosHistorico.push({ firebase_id: d.id, ...d.data() }));
    }
    window.filtrarListas();
};

window.carregarHistorico = async function(rp = true) {
    if(rp) limitePaginacao = 50; 
    const ds = document.getElementById('filtro-data-planilha')?.value || 'HOJE'; 
    const de = document.getElementById('data-especifica-planilha')?.value || ''; 
    const sl = document.getElementById('status-leitura-banco'); 
    const bm = document.getElementById('btn-carregar-mais');
    
    if(sl) sl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo banco...';
    
    try {
        let qH = null;
        if(ds === 'HOJE') { 
            qH = query(collection(db, "registros"), where("dia_particao", "==", obterDataString('HOJE'))); 
            if(bm) bm.classList.add('hidden'); 
        }
        else if(ds === 'ONTEM') { 
            qH = query(collection(db, "registros"), where("dia_particao", "==", obterDataString('ONTEM'))); 
            if(bm) bm.classList.add('hidden'); 
        }
        else if(ds === 'ESPECIFICA') { 
            if(!de) return; 
            const e = de.split('-'); 
            qH = query(collection(db, "registros"), where("dia_particao", "==", `${e[2]}/${e[1]}/${e[0]}`)); 
            if(bm) bm.classList.add('hidden'); 
        }
        else { 
            qH = query(collection(db, "registros"), orderBy("id", "desc"), limit(limitePaginacao)); 
            if(bm) bm.classList.remove('hidden'); 
        }
        
        const sn = await getDocs(qH); 
        registrosHistorico = []; 
        sn.forEach(d => registrosHistorico.push({ firebase_id: d.id, ...d.data() })); 
        registrosHistorico.sort((a, b) => (b.id || 0) - (a.id || 0));
        
        if(sl) sl.innerHTML = `<i class="fas fa-check-circle text-green-600"></i> ${registrosHistorico.length} sincronizados.`; 
        window.filtrarListas();
    } catch (err) { 
        if(sl) sl.innerHTML = `<i class="fas fa-exclamation-circle text-red-600"></i> Erro DB.`; 
    }
};

window.carregarMaisHistorico = function() { 
    limitePaginacao += 50; 
    window.carregarHistorico(false); 
};

window.buscarPlacaServidor = async function(origem) {
    const inp = origem === 'patio' ? 'busca-patio' : 'busca-planilha'; 
    const t = document.getElementById(inp).value.trim().toUpperCase();
    
    if(t.length < 3) return window.appAlert("Aviso", "Digite a placa completa para buscar no Servidor.", "aviso");
    
    try {
        const sn = await getDocs(query(collection(db, "registros"), where("placa", "==", t))); 
        const enc = []; 
        sn.forEach(d => enc.push({ firebase_id: d.id, ...d.data() }));
        
        enc.forEach(item => { 
            if(!registrosHistorico.some(r => r.firebase_id === item.firebase_id)) registrosHistorico.push(item); 
        });
        
        if(origem === 'patio' && enc.length > 0) document.getElementById('filtro-status-patio').value = 'TODOS';
        window.mostrarToast(`${enc.length} encontrados p/ ${t}`, enc.length > 0 ? 'sucesso' : 'aviso'); 
        window.filtrarListas();
    } catch (e) { 
        window.appAlert("Erro", "Falha na busca do banco.", "erro"); 
    }
};

function obterUnificada() {
    const m = new Map(); 
    registrosPatioAtivo.forEach(r => m.set(r.firebase_id, r)); 
    registrosHistorico.forEach(r => { 
        if(!m.has(r.firebase_id)) m.set(r.firebase_id, r); 
        else m.set(r.firebase_id, {...r, ...m.get(r.firebase_id)}); 
    });
    return Array.from(m.values()).sort((a,b) => (b.id || 0) - (a.id || 0));
}

window.abrirZoom = (u) => { 
    document.getElementById('img-zoom').src = u; 
    document.getElementById('modal-zoom').classList.remove('hidden'); 
};
window.fecharZoom = () => document.getElementById('modal-zoom').classList.add('hidden');

window.abrirDetalhes = function(id) {
    const r = obterUnificada().find(x => x.firebase_id === id); 
    if(!r) return; 
    const pen = !r.saida;
    
    const bo = r.foto ? `<div class="border rounded-xl p-2 bg-gray-50"><span class="block text-[10px] font-black uppercase text-blue-700 mb-1">Entrada</span><img src="${r.foto}" onclick="window.abrirZoom('${r.foto}')" class="w-full h-40 object-cover rounded-lg cursor-zoom-in"></div>` : `<div class="border rounded-xl p-4 bg-gray-50 flex items-center justify-center text-xs">Sem Foto</div>`;
    const bs = r.foto_saida ? `<div class="border rounded-xl p-2 bg-emerald-50"><span class="block text-[10px] font-black uppercase text-emerald-700 mb-1">Saída</span><img src="${r.foto_saida}" onclick="window.abrirZoom('${r.foto_saida}')" class="w-full h-40 object-cover rounded-lg cursor-zoom-in"></div>` : `<div class="border rounded-xl p-4 bg-gray-50 flex items-center justify-center text-xs text-center">${pen ? 'No Pátio' : 'Plano B (Sem Foto)'}</div>`;
    
    let inf = ''; 
    schemaCampos.forEach(c => { 
        if(c.tipo !== 'placa') inf += `<div class="border-b py-2"><span class="block text-[10px] text-gray-400 font-black uppercase tracking-widest">${c.nome}</span><span class="font-bold text-sm uppercase block whitespace-pre-wrap">${r.dados_dinamicos?.[c.id] || '---'}</span></div>`; 
    });
    
    const gE = r.gps && !r.gps.includes('Sem') && !r.gps.includes('Ind') ? `<a href="https://maps.google.com/?q=${encodeURIComponent(r.gps.replace(' (EXIF)','').trim())}" target="_blank" class="text-blue-500 underline text-[10px] ml-1"><i class="fas fa-map-marker-alt"></i> Mapa</a>` : '';
    const gS = r.gps_saida && !r.gps_saida.includes('Sem') && !r.gps_saida.includes('Plano') && !r.gps_saida.includes('Ind') ? `<a href="https://maps.google.com/?q=${encodeURIComponent(r.gps_saida.replace(' (EXIF)','').trim())}" target="_blank" class="text-blue-500 underline text-[10px] ml-1"><i class="fas fa-map-marker-alt"></i> Mapa</a>` : '';

    document.getElementById('conteudo-detalhes').innerHTML = `
        <div class="text-center"><div class="text-4xl font-black text-blue-950">${r.placa}</div></div>
        <div class="grid grid-cols-2 gap-2">${bo}${bs}</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div class="bg-blue-50 p-3 rounded-xl border border-blue-200">
                <span class="block text-[10px] text-blue-700 font-black uppercase">Entrada</span>
                <span class="font-black text-sm block">${r.entrada}</span>
                <span class="block text-[10px] text-gray-600 mt-1 uppercase font-bold">Op: ${r.visto_entrada}</span>
                <span class="block text-[10px] text-gray-500 uppercase mt-0.5">GPS: ${r.gps || 'N/A'} ${gE}</span>
            </div>
            <div class="bg-${pen ? 'amber' : 'emerald'}-50 p-3 rounded-xl border border-${pen ? 'amber' : 'emerald'}-200">
                <span class="block text-[10px] text-${pen ? 'amber' : 'emerald'}-700 font-black uppercase">Saída ${r.metodo_saida ? `(${r.metodo_saida})` : ''}</span>
                <span class="font-black text-sm block">${r.saida || 'Aguardando...'}</span>
                ${r.visto_saida ? `<span class="block text-[10px] text-gray-600 mt-1 uppercase font-bold">Op: ${r.visto_saida}</span>` : ''}
                ${!pen ? `<span class="block text-[10px] text-gray-500 uppercase mt-0.5">GPS: ${r.gps_saida \vert{}\vert{} 'N/A'}${gS}</span>` : ''}
                ${r.motivo_plano_b ? `<span class="block text-[9px] text-amber-800 font-black uppercase mt-1">${r.motivo_plano_b}</span>` : ''}
            </div>
        </div>
        <div class="bg-white p-3 border rounded-xl shadow-sm">${inf}</div>
    `;
    
    document.getElementById('rodape-detalhes').innerHTML = pen && permissoesAtuais.sai ? `<button onclick="window.fecharDetalhes(); window.abrirModalSaida('${r.firebase_id}')" class="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-xl shadow-md uppercase transition">Registrar Saída</button>` : `<button onclick="window.fecharDetalhes()" class="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-black py-4 rounded-xl uppercase transition">Fechar Ficha</button>`;
    
    document.getElementById('modal-detalhes').classList.remove('hidden');
};
window.fecharDetalhes = () => document.getElementById('modal-detalhes').classList.add('hidden');

window.filtrarListas = function() {
    const tp = document.getElementById('busca-patio')?.value.toUpperCase() || ''; 
    const sp = document.getElementById('filtro-status-patio')?.value || 'NO_PATIO'; 
    const dpS = document.getElementById('filtro-data-patio')?.value || 'TODAS'; 
    const dpE = document.getElementById('data-especifica-patio')?.value || '';
    
    const tl = document.getElementById('busca-planilha')?.value.toUpperCase() || ''; 
    const sl = document.getElementById('filtro-status-planilha')?.value || 'TODOS'; 
    const dlS = document.getElementById('filtro-data-planilha')?.value || 'HOJE'; 
    const dlE = document.getElementById('data-especifica-planilha')?.value || '';
    
    const lP = document.getElementById('lista-patio'); 
    const lL = document.getElementById('lista-planilha'); 
    if(!lP || !lL) return; 
    
    lP.innerHTML = ''; 
    lL.innerHTML = ''; 
    let cP = 0, cL = 0; 
    const hj = obterDataString('HOJE'); 
    const on = obterDataString('ONTEM'); 
    const un = obterUnificada();

    un.forEach(r => {
        const pend = !r.saida; 
        const tb = Object.values(r.dados_dinamicos || {}).join(" ").toUpperCase() + " " + r.placa; 
        const dt = r.dia_particao || r.entrada.substring(0, 10);
        
        let sPatio = true; 
        if(sp === 'NO_PATIO' && !pend) sPatio = false; 
        if(sp === 'SAIRAM' && pend) sPatio = false; 
        if(dpS === 'HOJE' && dt !== hj) sPatio = false; 
        if(dpS === 'ONTEM' && dt !== on) sPatio = false; 
        if(dpS === 'ESPECIFICA' && dpE) { const e = dpE.split('-'); if(dt !== `${e[2]}/${e[1]}/${e[0]}`) sPatio = false; } 
        if(tp && !tb.includes(tp)) sPatio = false;

        let sPlanilha = true; 
        if(sl === 'NO_PATIO' && !pend) sPlanilha = false; 
        if(sl === 'SAIRAM' && pend) sPlanilha = false; 
        if(dlS === 'HOJE' && dt !== hj) sPlanilha = false; 
        if(dlS === 'ONTEM' && dt !== on) sPlanilha = false; 
        if(dlS === 'ESPECIFICA' && dlE) { const e = dlE.split('-'); if(dt !== `${e[2]}/${e[1]}/${e[0]}`) sPlanilha = false; } 
        if(tl && !tb.includes(tl)) sPlanilha = false;

        const iE = r.foto ? `<img src="${r.foto}" onclick="event.stopPropagation(); window.abrirZoom('${r.foto}')" class="w-11 h-11 object-cover rounded-lg border shadow-sm cursor-zoom-in no-print">` : `<div class="w-11 h-11 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 no-print"><i class="fas fa-camera"></i></div>`;
        const iS = r.foto_saida ? `<img src="${r.foto_saida}" onclick="event.stopPropagation(); window.abrirZoom('${r.foto_saida}')" class="w-11 h-11 object-cover rounded-lg border border-emerald-400 shadow-sm cursor-zoom-in no-print">` : '';
        const bE = permissoesAtuais.edi ? `<button onclick="event.stopPropagation(); window.abrirEdicao('${r.firebase_id}')" class="text-blue-600 bg-blue-50 p-2 rounded-lg mr-1 no-print"><i class="fas fa-pen"></i></button>` : '';
        const bD = permissoesAtuais.exc ? `<button onclick="event.stopPropagation(); window.excluirIndiv('${r.firebase_id}')" class="text-red-600 bg-red-50 p-2 rounded-lg no-print"><i class="fas fa-trash"></i></button>` : '';
        const bgM = r.metodo_saida === 'PLANO_B' ? `<span class="bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">Plano B</span>` : r.metodo_saida === 'PLANO_A' ? `<span class="bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">Plano A</span>` : '';

        if(sPatio) {
            cP++; 
            const cd = document.createElement('div'); 
            cd.className = `bg-white rounded-2xl shadow-sm border-l-8 ${pend ? 'border-blue-600' : 'border-emerald-500'} p-4 flex flex-col relative cursor-pointer hover:bg-gray-50 transition`; 
            cd.setAttribute('onclick', `window.abrirDetalhes('${r.firebase_id}')`);
            
            let bS = ''; 
            if(pend && permissoesAtuais.sai) {
                bS = `<button onclick="event.stopPropagation(); window.abrirModalSaida('${r.firebase_id}')" class="mt-3 w-full bg-red-600 text-white font-black py-3 rounded-xl text-sm shadow uppercase transition"><i class="fas fa-sign-out-alt mr-1"></i> Registrar Saída</button>`;
            } else if (!pend) {
                bS = `<div class="mt-3 text-emerald-800 font-black text-center bg-emerald-50 py-2.5 px-3 rounded-xl border border-emerald-200 text-xs uppercase flex justify-between items-center"><span>✅ SAIU: ${r.saida.substring(0,16)}</span>${bgM}</div>`;
            }
            
            cd.innerHTML = `
                <div class="flex justify-between items-start border-b pb-3 mb-3">
                    <div class="flex items-center gap-2.5">${iE}${iS}<div><div class="font-black text-xl text-gray-800">${r.placa}</div><div class="text-[10px] font-bold text-gray-500 uppercase">${r.dados_dinamicos?.modelo || 'VEÍCULO'} • ${r.dados_dinamicos?.empresa || 'S/ EMPRESA'}</div></div></div>
                    <div class="text-right"><div class="text-[10px] text-gray-400 uppercase font-black">ENTRADA</div><div class="text-xs font-black text-blue-700">${r.entrada.split(' ')[0]}<br>${r.entrada.split(' ')[1]}</div></div>
                </div>
                <div class="flex justify-between items-center text-xs font-bold text-gray-600 uppercase">
                    <div><i class="fas fa-user text-gray-400 mr-1"></i> ${r.dados_dinamicos?.motorista || 'N/A'}</div>
                    <div class="no-print">${bE}${bD}</div>
                </div>
                ${bS}
            `; 
            lP.appendChild(cd);
        }

        if(sPlanilha) {
            cL++; 
            const tr = document.createElement('tr'); 
            tr.className = "hover:bg-gray-50 transition cursor-pointer"; 
            tr.setAttribute('onclick', `window.abrirDetalhes('${r.firebase_id}')`);
            
            let ac = ''; 
            if(pend && permissoesAtuais.sai) ac = `<button onclick="event.stopPropagation(); window.abrirModalSaida('${r.firebase_id}')" class="bg-red-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-sm uppercase no-print">SAÍDA</button>`; 
            else if(!pend) ac = `<span class="text-emerald-600 font-bold text-[9px] uppercase"><i class="fas fa-check"></i> OK</span>`;
            
            let rh = `<td class="px-2 py-2 border-r text-center no-print ${permissoesAtuais.exc ? '' : 'hidden'}" onclick="event.stopPropagation()"><input type="checkbox" class="cb-planilha w-4 h-4" value="${r.firebase_id}"></td>`;
            rh += `<td class="px-2 py-2 border-r text-center no-print whitespace-nowrap ${permissoesAtuais.edi || permissoesAtuais.exc || permissoesAtuais.sai ? '' : 'hidden'}">${bE}${bD} ${ac}</td>`;
            rh += `<td class="px-2 py-2 border-r text-center no-print"><div class="flex space-x-1 justify-center">${iE}${iS}</div></td>`;
            rh += `<td class="px-2 py-2 border-r font-bold text-blue-700 whitespace-nowrap">${r.entrada}</td>`;
            rh += `<td class="px-2 py-2 border-r font-bold ${pend ? 'text-gray-400' : 'text-emerald-700'} whitespace-nowrap">${r.saida || 'NO PÁTIO'}</td>`;
            rh += `<td class="px-2 py-2 border-r uppercase text-[10px] whitespace-nowrap text-gray-600 font-bold">E: ${r.visto_entrada}<br>S: ${r.visto_saida || '...'}</td>`;
            
            schemaCampos.forEach(c => { 
                if(c.tipo === 'placa') rh += `<td class="px-3 py-2 border-r font-black text-base">${r.placa}</td>`; 
                else rh += `<td class="px-3 py-2 border-r uppercase max-w-[150px] truncate" title="${r.dados_dinamicos?.[c.id] || ''}">${r.dados_dinamicos?.[c.id] || ''}</td>`; 
            });
            
            rh += `<td class="px-2 py-2 border-r text-[9px] whitespace-nowrap no-print"><b>E:</b> ${r.gps || '---'}<br><b>S:</b> ${r.gps_saida || '---'}</td>`;
            rh += `<td class="px-2 py-2 text-xs whitespace-nowrap no-print">${bgM} ${r.motivo_plano_b ? `<span class="text-[9px] text-gray-500 block">${r.motivo_plano_b}</span>` : ''}</td>`;
            
            tr.innerHTML = rh; 
            lL.appendChild(tr);
        }
    });

    const bP = document.getElementById('contador-patio-topo'); 
    if(bP) bP.innerText = `${registrosPatioAtivo.length} No Pátio`;
    
    if(cP === 0) lP.innerHTML = '<p class="text-center text-gray-400 py-10 font-bold uppercase">Nenhum veículo no pátio para este filtro.</p>';
    if(cL === 0) lL.innerHTML = '<tr><td colspan="17" class="text-center py-6 font-bold text-gray-400 uppercase">Nenhum registro encontrado.</td></tr>';
};

// ==========================================
// INICIALIZAÇÃO
// ==========================================
window.renderizarTudo();
