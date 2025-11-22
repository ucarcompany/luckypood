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
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
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
    background: rgba(255, 255, 255, 0.3);
  }
`;

const ChatWindow = styled.div<{ isOpen: boolean }>`
  position: fixed;
  bottom: 100px;
  right: 30px;
  width: 300px;
  height: 400px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(20px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2);
  z-index: 100;
  display: ${props => props.isOpen ? 'flex' : 'none'};
  flex-direction: column;
  overflow: hidden;
  transform-origin: bottom right;
  animation: fadeIn 0.3s ease;

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1); }
  }
`;

const ChatHeader = styled.div`
  padding: 15px;
  background: rgba(0, 0, 0, 0.2);
  color: white;
  font-weight: bold;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ChatBody = styled.div`
  flex: 1;
  padding: 12px;
  color: rgba(255,255,255,0.9);
  font-size: 13px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Msg = styled.div<{ mine?: boolean }>`
  align-self: ${p=>p.mine? 'flex-end':'flex-start'};
  max-width: 80%;
  background: ${p=>p.mine? 'linear-gradient(135deg, rgba(0,140,255,0.4), rgba(0,80,180,0.6))':'rgba(255,255,255,0.15)'};
  padding: 6px 10px;
  border-radius: 12px;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 6px rgba(0,0,0,0.25);
  word-break: break-word;
  font-size: 12px;
`;

const InputRow = styled.form`
  display: flex;
  gap: 6px;
  padding: 10px;
  border-top: 1px solid rgba(255,255,255,0.15);
`;
const TextInput = styled.input`
  flex: 1;
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 14px;
  padding: 6px 10px;
  color: #fff;
  font-size: 12px;
  outline: none;
  &:focus { border-color: rgba(255,255,255,0.6); }
`;
const SendBtn = styled.button`
  background: linear-gradient(135deg,#1d8bff,#005bbb);
  color:#fff;
  border:none;
  font-size:12px;
  padding: 6px 12px;
  border-radius: 14px;
  cursor:pointer;
  opacity:${p=>p.disabled?0.5:1};
`;

type ChatMsg = { ts: number; address: string; message: string };

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
      if (poolAddr) sock.emit('chat:join', { pool: poolAddr });
    });
    sock.on('chat:history', (items: any[]) => {
      const mapped = items.map(it => ({ ts: it.ts, address: it.address, message: it.message }));
      setMessages(mapped);
    });
    sock.on('chat:message', (msg: ChatMsg) => {
      setMessages(m => [...m, msg]);
    });
    return () => { try { sock.disconnect(); } catch {} sockRef.current = null; };
  }, [isOpen, poolAddr]);

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
    sockRef.current.emit('chat:send', { pool: poolAddr, address: account, token, message: msg });
    setMessages(m => [...m, { ts: Math.floor(Date.now()/1000), address: account.toLowerCase(), message: msg }]);
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
