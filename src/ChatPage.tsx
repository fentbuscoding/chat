// At the top of your file, after other imports
import { FixedSizeList as List, type ListChildComponentProps } from 'react-window';
import useElementSize from '@charlietango/use-element-size'; // You'll need to install this: npm install @charlietango/use-element-size

// Inside ChatPage component
const listRef = useRef<List>(null);
const chatContainerRef = useRef<HTMLDivElement>(null); // Ref for the scrollable area
const [chatWindowHeight, setChatWindowHeight] = useState(0);

// useEffect to calculate chat window height
useEffect(() => {
  if (chatContainerRef.current) {
    const containerHeight = chatContainerRef.current.clientHeight;
    // You might need to subtract padding or other elements' height if they are inside chatContainerRef
    // but outside the List component itself.
    setChatWindowHeight(containerHeight);
  }
}, []); // Recalculate if window resizes, or if dependencies change


// Row component for react-window
const Row = ({ index, style, data }: ListChildComponentProps<{ data: Message[] }>) => {
  const msg = data.data[index];
  // Theme context would be needed here if Row is outside
  // For now, assuming it can access theme or props are passed down
  return (
    <li
      key={msg.id}
      className={cn(
        "flex mb-1", // Add some margin between messages
        msg.sender === "me" ? "justify-end" : "justify-start"
      )}
      style={style} // React-window provides style for positioning
    >
      <div
        className={cn(
          "rounded-lg px-3 py-1 max-w-xs lg:max-w-md break-words", // Added break-words
          msg.sender === "me"
            ? "bg-blue-500 text-white" // Simplified style
            : "bg-gray-200 text-gray-800" // Simplified style
        )}
      >
        {msg.text}
      </div>
      {msg.sender !== "system" && (
        <span className="text-xxs text-gray-400 ml-1 self-end">
          {new Date(msg.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}
    </li>
  );
};

// // ChatPage component continued...

// // useEffect for scrolling to the bottom of the chat
useEffect(() => {
  if (listRef.current && messages.length > 0) {
    listRef.current.scrollToItem(messages.length - 1, "end");
  }
}, [messages]);

const itemHeight = 50; // Approximate height of a message item, adjust as needed
const { width: chatWindowWidth } = useElementSize(chatContainerRef); // Get width of the chat container

// ... rest of the ChatPage component
          <div
            className="flex-grow"
            ref={chatContainerRef} // Ref for the chat container to get its width
          >
            {/* Ensure there's enough height for the List to render */}
            {chatWindowHeight > 0 && chatWindowWidth > 0 && (
              <List
                ref={listRef}
                height={chatWindowHeight} // Use the calculated height
                itemCount={messages.length}
                itemSize={itemHeight} // Use fixed item height
                width="100%"
                itemData={{ data: messages }} // Pass messages as itemData
              >
                {Row}
              </List>
            )}
          </div>
        {/* </ScrollArea> ... */}
