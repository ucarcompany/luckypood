import styled from 'styled-components';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { hexlify, toUtf8Bytes } from 'ethers';
import { useWeb3 } from '../web3';
import { useTranslation } from 'react-i18next';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

const FloatButton = styled.button`
  position: fixed;
  bottom: 30px;
  right: 30px;
  width: 60px;
  height: 60px;
  border-radius: 30px;
  /* Glassmorphism Style */
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.2);
  
  color: white;
  font-size: 24px;
  cursor: pointer;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;

  &:hover {
    transform: scale(1.1);
    background: rgba(255, 255, 255, 0.4);
    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.3);
  }
`;

const ChatWindow = styled.div<{ isOpen: boolean }>`
  position: fixed;
  bottom: 100px;
  right: 30px;
  width: 320px;
  height: 450px;
  /* Glassmorphism Style */
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.15);
  
  z-index: 100;
  display: ${props => props.isOpen ? 'flex' : 'none'};
  flex-direction: column;
  overflow: hidden;
  transform-origin: bottom right;
  animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.9) translateY(20px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
`;

const ChatHeader = styled.div`
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  font-weight: 600;
  font-size: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  text-shadow: 0 1px 2px rgba(0,0,0,0.1);
`;

const ChatBody = styled.div`
  flex: 1;
  padding: 16px;
  color: #fff;
  font-size: 14px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  
  /* Custom Scrollbar */
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
`;

const Msg = styled.div<{ mine?: boolean }>`
  align-self: ${p=>p.mine? 'flex-end':'flex-start'};
  max-width: 85%;
  background: ${p=>p.mine? 'linear-gradient(135deg, rgba(0,122,255,0.6), rgba(0,198,255,0.6))':'rgba(255,255,255,0.2)'};
  padding: 8px 14px;
  border-radius: 16px;
  border-bottom-right-radius: ${p=>p.mine? '4px':'16px'};
  border-bottom-left-radius: ${p=>!p.mine? '4px':'16px'};
  backdrop-filter: blur(5px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  word-break: break-word;
  font-size: 13px;
  line-height: 1.4;
  border: 1px solid rgba(255,255,255,0.1);
`;

const InputRow = styled.form`
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255,255,255,0.15);
  background: rgba(0,0,0,0.05);
`;
const TextInput = styled.input`
  flex: 1;
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 20px;
  padding: 8px 14px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
  &::placeholder { color: rgba(255,255,255,0.5); }
  &:focus { 
    background: rgba(255,255,255,0.25);
    border-color: rgba(255,255,255,0.5); 
  }
`;
const SendBtn = styled.button`
  background: linear-gradient(135deg,#007aff,#00c6ff);
  color:#fff;
  border:none;
  font-weight: 600;
  font-size:13px;
  padding: 0 16px;
  border-radius: 20px;
  cursor:pointer;
  opacity:${p=>p.disabled?0.6:1};
  box-shadow: 0 2px 8px rgba(0,122,255,0.3);
  transition: transform 0.1s;
  &:active { transform: scale(0.96); }
`;

type ChatMsg = { ts: number; address: string; message: string; from?: string };

export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const sockRef = useRef<Socket | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { account, provider, connect } = useWeb3();
  const { t } = useTranslation();
  const poolAddr = import.meta.env.VITE_FACTORY_ADDRESS?.toLowerCase(); // 暂用 Factory 地址作为公共房间标识

  // Auto scroll
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, isOpen]);

  // Initialize socket on open
  useEffect(() => {
    if (!isOpen) return; if (sockRef.current) return;
    const sock = io(BACKEND_URL, { transports:['websocket'], withCredentials:true });
    sockRef.current = sock;
    sock.on('connect', () => {
      if (account) sock.emit('support:join', { address: account });
    });
    sock.on('support:history', (items: any[]) => {
      const mapped = items.map(it => ({ ts: it.ts, address: it.address, message: it.message, from: it.from }));
      setMessages(mapped);
    });
    sock.on('support:message', (msg: any) => {
      setMessages(m => [...m, { ts: msg.ts, address: msg.address, message: msg.message, from: msg.from }]);
    });
    sock.on('error', (err: any) => {
      setMessages(m => [...m, { ts: Date.now()/1000, address: 'system', message: `Error: ${err.message}`, from: 'system' }]);
    });
    return () => { try { sock.disconnect(); } catch {} sockRef.current = null; };
  }, [isOpen, account]);

  // Acquire auth token when account available & chat opened
  useEffect(() => {
    if (!isOpen || !account || token || connecting) return;
    (async () => {
      try {
        setConnecting(true);
        const adrLower = account.toLowerCase();
        const nonceResp = await fetch(`${BACKEND_URL}/api/chat/nonce?address=${adrLower}`);
        const j = await nonceResp.json(); if (!j.nonce) throw new Error('nonce');
        const message = `Lucky-pool Chat Login\nAddress: ${adrLower}\nNonce: ${j.nonce}`;
        let signature: string;
        if (provider) {
          const signer = await provider.getSigner();
          signature = await signer.signMessage(message);
        } else if ((window as any).ethereum?.request) {
          // fallback personal_sign
          const hexMsg = hexlify(toUtf8Bytes(message));
          signature = await (window as any).ethereum.request({ method: 'personal_sign', params: [hexMsg, account] });
        } else throw new Error('no_provider');
        const authResp = await fetch(`${BACKEND_URL}/api/chat/auth`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ address: adrLower, signature }) });
        const a = await authResp.json(); if (!a.ok) throw new Error('auth');
        setToken(a.token);
      } catch (e) { console.warn('chat auth failed', e); }
      finally { setConnecting(false); }
    })();
  }, [isOpen, account, token, provider]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !token || !account || !sockRef.current) return;
    const msg = input.trim();
    // Use support:send
    sockRef.current.emit('support:send', { address: account, token, message: msg });
    setInput('');
  };

  return (
    <>
      <FloatButton onClick={() => setIsOpen(o=>!o)}>💬</FloatButton>
      <ChatWindow isOpen={isOpen}>
        <ChatHeader>
          <span>{t('community_chat') || '社区聊天'}</span>
          <span style={{cursor:'pointer'}} onClick={() => setIsOpen(false)}>✕</span>
        </ChatHeader>
        <ChatBody ref={bodyRef}>
          {!messages.length && <Msg>暂无消息...</Msg>}
          {messages.map((m,i)=>(
            <Msg key={i} mine={!!account && m.address === account.toLowerCase()}>
              <div style={{opacity:0.6,fontSize:10}}>{m.address.slice(0,6)}…{m.address.slice(-4)} · {new Date(m.ts*1000).toLocaleTimeString()}</div>
              <div>{m.message}</div>
            </Msg>
          ))}
        </ChatBody>
        <InputRow onSubmit={sendMessage}>
          {!account && <SendBtn type="button" onClick={connect}>连接</SendBtn>}
          {account && <TextInput value={input} placeholder={connecting? '认证中...' : '输入消息'} onChange={e=>setInput(e.target.value)} />}
          {account && <SendBtn disabled={!token || !input.trim()} type="submit">发送</SendBtn>}
        </InputRow>
      </ChatWindow>
    </>
  );
}
