import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const Dashboard = ({ setIsLoggedIn, isPremium, setIsPremium }) => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const premiumColors = ['#ffffff', '#fee2e2', '#dbeafe', '#dcfce3', '#fef9c3']; // White, Red, Blue, Green, Yellow

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await api.get('/tasks');
      setTasks(res.data);
    } catch (err) {
      console.error("Error fetching tasks", err);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    try {
      const res = await api.post('/tasks', { title: newTask });
      setTasks([...tasks, res.data]);
      setNewTask('');
    } catch (err) {
      console.error("Error adding task", err);
    }
  };

  const handleDeleteTask = async (id) => {
    try {
      await api.delete(`/tasks/${id}`);
      setTasks(tasks.filter(task => task._id !== id));
    } catch (err) {
      console.error("Error deleting task", err);
    }
  };

  const handleUpdateTitle = async (id) => {
    try {
      const res = await api.put(`/tasks/${id}`, { title: editTitle });
      setTasks(tasks.map(t => t._id === id ? res.data : t));
      setEditingId(null);
    } catch (err) {
      console.error("Error updating task", err);
    }
  };

  const handleColorChange = async (id, newColor) => {
    try {
      const res = await api.put(`/tasks/${id}`, { colorCode: newColor });
      setTasks(tasks.map(t => t._id === id ? res.data : t));
    } catch (err) {
      console.error("Error updating color", err);
    }
  };

  const handleToggleComplete = async (id, currentStatus) => {
    try {
      const res = await api.put(`/tasks/${id}`, { completed: !currentStatus });
      setTasks(tasks.map(t => t._id === id ? res.data : t));
    } catch (err) {
      console.error("Error updating task status", err);
    }
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const items = Array.from(tasks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    const updatedItems = items.map((item, index) => ({ ...item, order: index }));
    setTasks(updatedItems);

    try {
      const itemsToUpdate = updatedItems.map(item => ({ _id: item._id, order: item.order }));
      await api.put('/tasks/reorder', { items: itemsToUpdate });
    } catch (err) {
      console.error("Error saving new order", err);
    }
  };

  const handleBuyPremium = async () => {
    try {
      const { data: order } = await api.post('/premium/create-order');
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: 'Todo Cloud Pro',
        description: 'Upgrade to Premium Features',
        order_id: order.id,
        handler: async function (response) {
          try {
            const verifyRes = await api.post('/premium/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            alert(verifyRes.data.message);
            setIsPremium(true);
          } catch (err) {
            alert('Payment verification failed.');
          }
        },
        theme: { color: '#2563eb' }
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error('Payment failed', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    navigate('/');
  };

  const renderTaskContent = (task) => (
    <div className="flex flex-col w-full">
      <div className="flex justify-between items-center mb-2">
        {editingId === task._id ? (
          <div className="flex gap-2 flex-1 mr-4">
            <input 
              type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
              className="flex-1 border p-1 rounded" autoFocus
            />
            <button onClick={() => handleUpdateTitle(task._id)} className="bg-green-500 text-white px-2 py-1 rounded text-sm">Save</button>
            <button onClick={() => setEditingId(null)} className="bg-gray-400 text-white px-2 py-1 rounded text-sm">Cancel</button>
          </div>
        ) : (
          <div className="flex items-center flex-1 mr-4 gap-3">
            <input 
              type="checkbox" 
              checked={task.completed || false} 
              onChange={() => handleToggleComplete(task._id, task.completed)}
              className="w-5 h-5 text-blue-600 rounded"
            />
            <span className="text-gray-900 font-medium flex-1">
              {isPremium && '☰ '} {task.title}
            </span>
          </div>
        )}
        
        <div className="flex gap-2">
          {editingId !== task._id && (
            <button onClick={() => { setEditingId(task._id); setEditTitle(task.title); }} className="text-blue-500 hover:bg-blue-100 p-1 rounded text-sm">Edit</button>
          )}
          <button onClick={() => handleDeleteTask(task._id)} className="text-red-500 hover:bg-red-100 p-1 rounded text-sm">Delete</button>
        </div>
      </div>

      {/* Premium Color Picker */}
      {isPremium && (
        <div className="flex gap-2 mt-2">
          {premiumColors.map(color => (
            <button
              key={color}
              onClick={() => handleColorChange(task._id, color)}
              className={`w-5 h-5 rounded-full border border-gray-300 shadow-sm transition hover:scale-110 ${task.colorCode === color ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
              style={{ backgroundColor: color }}
              title={`Set color ${color}`}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen p-8">
      <header className="max-w-4xl mx-auto flex justify-between items-center bg-white p-6 rounded-lg shadow-md mb-8 border-t-4 border-blue-600">
        <div>
          <h1 className="text-3xl font-bold text-blue-800">My Tasks</h1>
          {isPremium ? (
             <span className="text-sm font-bold text-yellow-600 bg-yellow-100 px-2 py-1 rounded">👑 Premium Member</span>
          ) : (
            <span className="text-sm text-gray-500">Free Tier</span>
          )}
        </div>
        <div className="flex gap-4">
          {!isPremium && (
            <button onClick={handleBuyPremium} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded shadow transition">
              Upgrade (₹500)
            </button>
          )}
          <button onClick={handleLogout} className="border border-red-500 text-red-500 hover:bg-red-50 font-bold py-2 px-4 rounded transition">
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-md">
        <form onSubmit={handleAddTask} className="flex gap-4 mb-6">
          <input 
            type="text" value={newTask} onChange={(e) => setNewTask(e.target.value)} 
            placeholder="What needs to be done?" 
            className="flex-1 border border-blue-200 p-3 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded transition">
            Add Task
          </button>
        </form>

        {tasks.length === 0 ? (
          <p className="text-center text-gray-500 py-4">No tasks yet. Add one above!</p>
        ) : (
          isPremium ? (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="tasks">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="flex flex-col gap-3">
                    {tasks.map((task, index) => (
                      <Draggable key={task._id} draggableId={task._id} index={index}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className="flex justify-between items-center p-4 rounded border border-gray-200 shadow-sm"
                            style={{ 
                              ...provided.draggableProps.style, 
                              backgroundColor: task.colorCode || '#ffffff' 
                            }}
                          >
                            {renderTaskContent(task)}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          ) : (
            <div className="flex flex-col gap-3">
              {tasks.map((task) => (
                <div 
                  key={task._id} 
                  className="flex justify-between items-center p-4 rounded border border-gray-200 shadow-sm"
                  style={{ backgroundColor: task.colorCode || '#ffffff' }}
                >
                  {renderTaskContent(task)}
                </div>
              ))}
            </div>
          )
        )}
      </main>
    </div>
  );
};

export default Dashboard;