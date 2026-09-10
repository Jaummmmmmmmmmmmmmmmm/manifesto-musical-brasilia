/**
 * GUICHÊ WEB - MANIFESTO MUSICAL BRASÍLIA
 * Interactive Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // State
  const state = {
    demoMode: true, // Allow user to simulate ticket selection
    tickets: {
      camarote_r2: { name: 'Camarote R2 Open Bar (18+)', price: 899.00, qty: 0 },
      camarote_open: { name: 'Camarote Open (18+)', price: 759.00, qty: 0 },
      front_stage_meia: { name: 'Front Stage (Meia / Solidária)', price: 400.00, qty: 0 },
      front_stage_inteira: { name: 'Front Stage (Inteira)', price: 800.00, qty: 0 },
      arq_inferior_meia: { name: 'Arquibancada Inferior (Meia / Solidária)', price: 275.00, qty: 0 },
      arq_inferior_inteira: { name: 'Arquibancada Inferior (Inteira)', price: 550.00, qty: 0 },
      arq_superior_meia: { name: 'Arquibancada Superior (Meia / Solidária)', price: 90.00, qty: 0 },
      arq_superior_inteira: { name: 'Arquibancada Superior (Inteira)', price: 180.00, qty: 0 },
    },
    serviceFeeRate: 0.13, // 13% official fee
  };

  // Selectors
  const cartBar = document.getElementById('gw-cart-bar');
  const cartBadge = document.getElementById('gw-cart-badge');
  const cartItemsCount = document.getElementById('gw-cart-items-count');
  const cartTotalVal = document.getElementById('gw-cart-total-val');
  const cartFeeVal = document.getElementById('gw-cart-fee-val');
  const toggleModeBtn = document.getElementById('gw-toggle-mode');
  const demoTicketsContainer = document.getElementById('gw-demo-tickets');
  const soldoutTicketsContainer = document.getElementById('gw-soldout-tickets');
  const toast = document.getElementById('gw-toast');

  // Format currency
  function formatMoney(amount) {
    return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // Show Toast
  function showToast(message, icon = 'fa-check-circle') {
    if (!toast) return;
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }

  // Update Cart State and UI
  function updateCart() {
    let totalItems = 0;
    let subtotal = 0;

    Object.values(state.tickets).forEach(t => {
      totalItems += t.qty;
      subtotal += t.qty * t.price;
    });

    const fee = subtotal * state.serviceFeeRate;
    const total = subtotal + fee;

    // Update floating cart bar
    if (totalItems > 0 && state.demoMode) {
      cartBar.classList.add('visible');
      cartBadge.textContent = totalItems;
      cartBadge.style.display = 'inline-block';
      cartItemsCount.textContent = `${totalItems} ${totalItems === 1 ? 'INGRESSO' : 'INGRESSOS'}`;
      cartTotalVal.textContent = formatMoney(total);
      cartFeeVal.textContent = `Taxa de serviço (13%): ${formatMoney(fee)}`;
    } else {
      cartBar.classList.remove('visible');
      cartBadge.textContent = '0';
      cartBadge.style.display = 'none';
    }
  }

  // Quantity button handlers
  document.querySelectorAll('.gw-qty-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = btn.getAttribute('data-action');
      const ticketId = btn.getAttribute('data-ticket');
      const numSpan = document.getElementById(`qty-${ticketId}`);

      if (!state.tickets[ticketId]) return;

      if (action === 'plus') {
        if (state.tickets[ticketId].qty < 6) {
          state.tickets[ticketId].qty++;
        } else {
          showToast('Limite de 6 ingressos por CPF/setor.', 'fa-exclamation-triangle');
        }
      } else if (action === 'minus') {
        if (state.tickets[ticketId].qty > 0) {
          state.tickets[ticketId].qty--;
        }
      }

      numSpan.textContent = state.tickets[ticketId].qty;
      const minusBtn = document.querySelector(`.gw-qty-btn[data-action="minus"][data-ticket="${ticketId}"]`);
      if (minusBtn) {
        minusBtn.disabled = state.tickets[ticketId].qty === 0;
      }

      updateCart();
    });
  });

  // Toggle Mode (Demo purchase vs Sold Out View)
  if (toggleModeBtn) {
    toggleModeBtn.addEventListener('click', () => {
      state.demoMode = !state.demoMode;
      if (state.demoMode) {
        demoTicketsContainer.style.display = 'block';
        soldoutTicketsContainer.style.display = 'none';
        toggleModeBtn.innerHTML = '<i class="fas fa-eye"></i> Visualizar Status Esgotado';
        showToast('Modo demonstração de compra ativado.');
        updateCart();
      } else {
        demoTicketsContainer.style.display = 'none';
        soldoutTicketsContainer.style.display = 'block';
        toggleModeBtn.innerHTML = '<i class="fas fa-shopping-cart"></i> Simular Seleção de Ingressos';
        cartBar.classList.remove('visible');
        showToast('Exibindo status oficial: Ingressos Esgotados.');
      }
    });
  }

  // FAQ Accordion
  document.querySelectorAll('.gw-faq-question').forEach(q => {
    q.addEventListener('click', () => {
      const item = q.closest('.gw-faq-item');
      const wasOpen = item.classList.contains('open');

      // Close all
      document.querySelectorAll('.gw-faq-item').forEach(other => {
        other.classList.remove('open');
      });

      if (!wasOpen) {
        item.classList.add('open');
      }
    });
  });

  // Subnav smooth scroll and active tab highlighting
  const subnavBtns = document.querySelectorAll('.gw-tab-btn');
  subnavBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-target');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        const offset = 130; // Navbar + Subnav height
        const bodyRect = document.body.getBoundingClientRect().top;
        const elementRect = targetEl.getBoundingClientRect().top;
        const elementPosition = elementRect - bodyRect;
        const offsetPosition = elementPosition - offset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });

        subnavBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  });

  // Highlight tabs on scroll
  window.addEventListener('scroll', () => {
    const scrollPos = window.scrollY + 160;
    const sections = ['sec-ingressos', 'sec-mapa', 'sec-localizacao', 'sec-pdvs', 'sec-info', 'sec-meia', 'sec-video'];

    sections.forEach(secId => {
      const el = document.getElementById(secId);
      if (el) {
        const top = el.offsetTop;
        const height = el.offsetHeight;
        if (scrollPos >= top && scrollPos < top + height) {
          subnavBtns.forEach(b => {
            if (b.getAttribute('data-target') === secId) {
              b.classList.add('active');
            } else {
              b.classList.remove('active');
            }
          });
        }
      }
    });
  });

  // Map Lightbox
  const mapImg = document.getElementById('gw-map-img');
  const lightboxModal = document.getElementById('gw-map-lightbox');
  const mapOpenBtn = document.getElementById('gw-open-map-lightbox');

  function openMapModal() {
    if (lightboxModal) lightboxModal.classList.add('open');
  }

  if (mapImg) mapImg.addEventListener('click', openMapModal);
  if (mapOpenBtn) mapOpenBtn.addEventListener('click', openMapModal);

  document.querySelectorAll('.gw-modal-close, .gw-modal-backdrop').forEach(closer => {
    closer.addEventListener('click', (e) => {
      if (e.target === closer || closer.classList.contains('gw-modal-close') || closer.closest('.gw-modal-close')) {
        document.querySelectorAll('.gw-modal-backdrop').forEach(m => m.classList.remove('open'));
      }
    });
  });

  // Prevent closing when clicking modal content
  document.querySelectorAll('.gw-modal-box, .gw-lightbox-img').forEach(box => {
    box.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });

  // Coupon Application
  const couponBtn = document.getElementById('gw-apply-coupon');
  const couponInput = document.getElementById('gw-coupon-input');
  if (couponBtn && couponInput) {
    couponBtn.addEventListener('click', () => {
      const code = couponInput.value.trim();
      if (!code) {
        showToast('Digite um código de cupom.', 'fa-exclamation-circle');
      } else if (code.toUpperCase() === 'HEJ10' || code.toUpperCase() === 'MANIFESTO') {
        showToast(`Cupom "${code.toUpperCase()}" aplicado com 10% de desconto!`, 'fa-tag');
      } else {
        showToast('Cupom inválido ou expirado.', 'fa-times-circle');
      }
    });
  }

  // Floating SAC Support Toggle
  const sacBtn = document.getElementById('gw-sac-btn');
  const sacBalloon = document.getElementById('gw-sac-balloon');
  const sacClose = document.getElementById('gw-sac-close');

  if (sacBtn && sacBalloon) {
    sacBtn.addEventListener('click', () => {
      sacBalloon.classList.toggle('open');
    });
  }

  if (sacClose && sacBalloon) {
    sacClose.addEventListener('click', () => {
      sacBalloon.classList.remove('open');
    });
  }

  // Checkout Modal & PIX Flow
  const checkoutBtn = document.getElementById('gw-btn-checkout');
  const checkoutModal = document.getElementById('gw-checkout-modal');
  const checkoutSummaryList = document.getElementById('gw-checkout-summary-list');
  const checkoutFinalTotal = document.getElementById('gw-checkout-final-total');
  const checkoutForm = document.getElementById('gw-checkout-form');
  const generatePixBtn = document.getElementById('gw-btn-generate-pix');
  const cpfInput = document.getElementById('gw-checkout-cpf');
  const copyPixBtn = document.getElementById('gw-btn-copy-pix');
  const copyPixInput = document.getElementById('gw-pix-copypaste-input');
  const newOrderBtn = document.getElementById('gw-btn-new-order');
  const step1 = document.getElementById('gw-checkout-step-1');
  const step2 = document.getElementById('gw-checkout-step-2');
  let pixTimer = null;

  // CPF Input formatting mask
  if (cpfInput) {
    cpfInput.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '');
      if (v.length > 11) v = v.substring(0, 11);
      if (v.length > 9) {
        v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
      } else if (v.length > 6) {
        v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
      } else if (v.length > 3) {
        v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
      }
      e.target.value = v;
    });
  }

  // PIX Countdown timer (15 minutes)
  function startPixCountdown(totalSeconds) {
    if (pixTimer) clearInterval(pixTimer);
    const countdownEl = document.getElementById('gw-pix-countdown');
    if (!countdownEl) return;

    let remain = totalSeconds;
    const updateDisplay = () => {
      const m = Math.floor(remain / 60).toString().padStart(2, '0');
      const s = (remain % 60).toString().padStart(2, '0');
      countdownEl.textContent = `${m}:${s}`;
    };

    updateDisplay();
    pixTimer = setInterval(() => {
      remain--;
      if (remain <= 0) {
        clearInterval(pixTimer);
        countdownEl.textContent = 'Expirado';
      } else {
        updateDisplay();
      }
    }, 1000);
  }

  // Open Checkout Modal
  if (checkoutBtn && checkoutModal) {
    checkoutBtn.addEventListener('click', () => {
      // Reset view to Step 1
      if (step1) step1.style.display = 'block';
      if (step2) step2.style.display = 'none';

      // Build summary
      let html = '';
      let subtotal = 0;

      Object.values(state.tickets).forEach(t => {
        if (t.qty > 0) {
          const itemTotal = t.qty * t.price;
          subtotal += itemTotal;
          html += `
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13.5px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
              <span><strong>${t.qty}x</strong> ${t.name}</span>
              <strong>${formatMoney(itemTotal)}</strong>
            </div>
          `;
        }
      });

      const fee = subtotal * state.serviceFeeRate;
      const total = subtotal + fee;

      html += `
        <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 13px; color: #64748b;">
          <span>Subtotal</span>
          <span>${formatMoney(subtotal)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 13px; color: #64748b;">
          <span>Taxa de Serviço (13%)</span>
          <span>${formatMoney(fee)}</span>
        </div>
      `;

      checkoutSummaryList.innerHTML = html;
      checkoutFinalTotal.textContent = formatMoney(total);
      checkoutModal.classList.add('open');
    });
  }

  // Handle Checkout Form Submission -> Call backend /api/checkout (MisticPay)
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      let totalItems = 0;
      let subtotal = 0;
      const itemsList = [];
      Object.entries(state.tickets).forEach(([id, t]) => {
        if (t.qty > 0) {
          totalItems += t.qty;
          subtotal += t.qty * t.price;
          itemsList.push(`${t.qty}x ${t.name}`);
        }
      });

      if (totalItems === 0) {
        showToast('Selecione ao menos 1 ingresso antes de prosseguir.', 'fa-exclamation-triangle');
        return;
      }

      const nome = document.getElementById('gw-checkout-nome').value.trim();
      const cpf = document.getElementById('gw-checkout-cpf').value.trim();
      const email = document.getElementById('gw-checkout-email').value.trim();
      const endereco = document.getElementById('gw-checkout-endereco').value.trim();

      const cleanCpf = cpf.replace(/\D/g, '');
      if (cleanCpf.length !== 11) {
        showToast('Por favor, informe um CPF válido com 11 dígitos.', 'fa-exclamation-circle');
        return;
      }

      const fee = subtotal * state.serviceFeeRate;
      const finalTotal = Number((subtotal + fee).toFixed(2));

      const originalBtnHtml = generatePixBtn.innerHTML;
      generatePixBtn.disabled = true;
      generatePixBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando PIX MisticPay...';

      try {
        const response = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome,
            cpf: cleanCpf,
            email,
            endereco,
            amount: finalTotal,
            itemsSummary: itemsList.join(', ')
          })
        });

        const result = await response.json();

        if (response.ok && result.success && result.qrCodeBase64) {
          const qrImg = document.getElementById('gw-pix-qrcode-img');
          if (qrImg) qrImg.src = result.qrCodeBase64;
          if (copyPixInput) copyPixInput.value = result.copyPaste || '';

          if (step1) step1.style.display = 'none';
          if (step2) step2.style.display = 'block';

          startPixCountdown(15 * 60);
          showToast('Cobrança PIX gerada com sucesso!', 'fa-qrcode');
        } else {
          showToast(result.error || 'Não foi possível gerar a cobrança PIX. Tente novamente.', 'fa-exclamation-triangle');
        }
      } catch (err) {
        console.error(err);
        showToast('Erro de conexão ao comunicar com o servidor.', 'fa-times-circle');
      } finally {
        generatePixBtn.disabled = false;
        generatePixBtn.innerHTML = originalBtnHtml;
      }
    });
  }

  // Copy PIX button
  if (copyPixBtn && copyPixInput) {
    copyPixBtn.addEventListener('click', () => {
      const text = copyPixInput.value;
      if (!text) return;

      const fallbackCopy = () => {
        copyPixInput.select();
        copyPixInput.setSelectionRange(0, 99999);
        document.execCommand('copy');
        showToast('Código PIX copiado com sucesso!', 'fa-clipboard-check');
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast('Código PIX copiado com sucesso!', 'fa-clipboard-check');
        }).catch(() => {
          fallbackCopy();
        });
      } else {
        fallbackCopy();
      }
    });
  }

  // Return / New Order button
  if (newOrderBtn) {
    newOrderBtn.addEventListener('click', () => {
      if (pixTimer) clearInterval(pixTimer);
      if (step1) step1.style.display = 'block';
      if (step2) step2.style.display = 'none';
    });
  }

  // Share Actions
  document.querySelectorAll('.gw-share-icon').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = btn.getAttribute('data-share');
      const url = window.location.href;
      const title = 'Manifesto Musical - Brasília | Henrique & Juliano na Guichê Web';

      if (type === 'copy') {
        navigator.clipboard.writeText(url).then(() => {
          showToast('Link copiado para a área de transferência!', 'fa-clipboard-check');
        }).catch(() => {
          showToast('Link copiado!');
        });
      } else if (type === 'whatsapp') {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(title + ' ' + url)}`, '_blank');
      } else if (type === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'width=600,height=500');
      } else if (type === 'x-twitter') {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, '_blank', 'width=600,height=500');
      }
    });
  });

  // Search input mock
  const searchInput = document.getElementById('gw-search-input');
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const val = searchInput.value.trim();
        if (val) {
          showToast(`Pesquisando por: "${val}"...`, 'fa-search');
        }
      }
    });
  }
});
